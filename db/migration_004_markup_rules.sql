-- ============================================================
-- Migration 004: markup becomes a dated rule table, editable from /admin.
--
-- Supersedes the hard-coded "+ 300" from migration 003. The business wants
-- to move the markup (300 -> 350, or down to 200) for FUTURE rates while
-- every already-published point keeps the markup that was in force on its
-- own date. So: one row per change, keyed on effective_from, and the view
-- picks the newest rule whose effective_from <= quote_date.
--
-- quote_date, not the day the admin pressed the button. A mail dated 14 Oct
-- that arrives on 16 Oct must still get the 14 Oct markup, and re-ingesting
-- history must reproduce the same chart.
--
-- Still applied on READ. freight_quotes stays raw.
--
-- The seed row is dated 1970-01-01 so that every quote_date has exactly one
-- rule and the join can never return NULL. Its amount (300) mirrors what
-- migration 003 hard-coded, so this migration changes no published number.
--
-- Safe to re-run: table IF NOT EXISTS, seed ON CONFLICT DO NOTHING, views
-- CREATE OR REPLACE.
-- ============================================================

CREATE TABLE IF NOT EXISTS markup_rules (
    id             BIGSERIAL PRIMARY KEY,
    effective_from DATE        NOT NULL UNIQUE,
    amount_usd     INTEGER     NOT NULL CHECK (amount_usd BETWEEN 0 AND 1000),
    set_by         TEXT        NOT NULL DEFAULT 'admin',
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO markup_rules (effective_from, amount_usd, set_by, note)
VALUES ('1970-01-01', 300, 'migration_004', 'initial flat markup, carried over from migration 003')
ON CONFLICT (effective_from) DO NOTHING;


-- Same shape as before: rate_20 / rate_40 / min_40 / max_40 carry the markup,
-- markup_usd says how much. Only the source of the number changed.
CREATE OR REPLACE VIEW freight_index_daily AS
WITH raw AS (
    SELECT
        quote_date,
        origin_port,
        dest_port,
        ROUND(AVG(rate_20))::INT          AS rate_20,
        ROUND(AVG(rate_40))::INT          AS rate_40,
        COUNT(rate_20)::INT               AS n_20,
        COUNT(rate_40)::INT               AS n_40,
        MIN(rate_40)::INT                 AS min_40,
        MAX(rate_40)::INT                 AS max_40,
        COUNT(DISTINCT sender)::INT       AS n_senders,
        STRING_AGG(DISTINCT source, ',')  AS sources
    FROM freight_quotes
    GROUP BY quote_date, origin_port, dest_port
)
SELECT
    r.quote_date,
    r.origin_port,
    r.dest_port,
    r.rate_20 + m.amount_usd              AS rate_20,
    r.rate_40 + m.amount_usd              AS rate_40,
    r.n_20,
    r.n_40,
    r.min_40 + m.amount_usd               AS min_40,
    r.max_40 + m.amount_usd               AS max_40,
    r.n_senders,
    r.sources,
    m.amount_usd                          AS markup_usd
FROM raw r
CROSS JOIN LATERAL (
    SELECT amount_usd
    FROM markup_rules
    WHERE effective_from <= r.quote_date
    ORDER BY effective_from DESC
    LIMIT 1
) m;

CREATE OR REPLACE VIEW freight_index_latest AS
SELECT DISTINCT ON (origin_port, dest_port) *
FROM freight_index_daily
ORDER BY origin_port, dest_port, quote_date DESC;
