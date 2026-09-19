-- ============================================================
-- Migration 003: published rates carry a flat +300 USD markup.
--
-- Ocean Star's mailed rates are wholesale -- only a handful of Indian
-- agencies receive them, never end customers -- and the invoice at booking
-- adds ~300-400 USD of fuel (BAF) and currency (CAF) surcharges on top.
-- The chart shows OUR customer-facing rate: base + 300, both box sizes.
-- Business decision, 2026-09-19. No footnote on the page; that IS the rate.
--
-- Applied on READ, never at ingest. freight_quotes stays the raw agent
-- quote (parser fixture still asserts $1560/$1586 on 17 Jul), so changing
-- the markup is a one-line edit here and the whole history recomputes.
--
-- Same constant lives in update.py (MARKUP_USD) for the static fallback
-- data/index.json. Change one, change the other.
--
-- Safe to re-run: CREATE OR REPLACE VIEW, no data touched.
-- Rollback: re-run the view definition from db/schema.sql at commit 83e0440.
-- ============================================================

CREATE OR REPLACE VIEW freight_index_daily AS
SELECT
    quote_date,
    origin_port,
    dest_port,
    ROUND(AVG(rate_20))::INT + 300    AS rate_20,
    ROUND(AVG(rate_40))::INT + 300    AS rate_40,
    COUNT(rate_20)::INT               AS n_20,
    COUNT(rate_40)::INT               AS n_40,
    MIN(rate_40)::INT + 300           AS min_40,
    MAX(rate_40)::INT + 300           AS max_40,
    COUNT(DISTINCT sender)::INT       AS n_senders,
    STRING_AGG(DISTINCT source, ',')  AS sources,
    300                               AS markup_usd
FROM freight_quotes
GROUP BY quote_date, origin_port, dest_port;

-- freight_index_latest is SELECT * over the view above; recreate so it
-- picks up the new markup_usd column.
CREATE OR REPLACE VIEW freight_index_latest AS
SELECT DISTINCT ON (origin_port, dest_port) *
FROM freight_index_daily
ORDER BY origin_port, dest_port, quote_date DESC;
