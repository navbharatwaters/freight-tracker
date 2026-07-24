-- ============================================================
-- iKargos China -> India Freight Tracker
-- Postgres schema
-- ============================================================

-- ------------------------------------------------------------
-- 1. RAW LAYER: one row per carrier quote line, exactly as parsed.
--    Never aggregated, never edited. This is the audit trail.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight_quotes (
    id            BIGSERIAL PRIMARY KEY,

    quote_date    DATE        NOT NULL,      -- ORIGINAL send date of the agent's mail
                                             -- (NOT the forward date -- see extract.py)
    origin_port   TEXT        NOT NULL,
    dest_port     TEXT        NOT NULL,

    rate_20       INTEGER,                   -- NULL when quote is 40HQ-only
    rate_40       INTEGER,                   -- NULL when quote is 20GP-only
    CONSTRAINT rate_present CHECK (rate_20 IS NOT NULL OR rate_40 IS NOT NULL),
    CONSTRAINT rate_sane_20 CHECK (rate_20 IS NULL OR rate_20 BETWEEN 100 AND 20000),
    CONSTRAINT rate_sane_40 CHECK (rate_40 IS NULL OR rate_40 BETWEEN 100 AND 20000),

    source        TEXT        NOT NULL,      -- agency: 'ocean_star'. Second agency -> new value.
    sender        TEXT,                      -- as01@ / as23@ -- which rep sent it
    message_id    TEXT,                      -- RFC Message-ID: the idempotency key
    raw_line      TEXT        NOT NULL,      -- verbatim source line, for debugging
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: re-running the same mail (or re-uploading via /admin) must not
-- duplicate rows. Includes raw_line so two different sailings of the same
-- carrier (different rates or ETDs) are kept as distinct quotes.
-- Deliberately does NOT include message_id -- backfilled forwards have NULL
-- message_id, so a partial-index dedupe would let re-uploads double them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_freight_quotes_dedupe
    ON freight_quotes (quote_date, origin_port, dest_port, source, raw_line);

CREATE INDEX IF NOT EXISTS ix_freight_quotes_lane
    ON freight_quotes (dest_port, origin_port, quote_date);
CREATE INDEX IF NOT EXISTS ix_freight_quotes_date
    ON freight_quotes (quote_date);


-- ------------------------------------------------------------
-- 2. MAIL LOG: one row per email processed.
--    Tells you WHY a date has no data (no mail vs mail that failed to parse).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight_mail_log (
    message_id    TEXT        PRIMARY KEY,
    sent_at       TIMESTAMPTZ NOT NULL,      -- original send time
    subject       TEXT,
    sender        TEXT,
    source        TEXT        NOT NULL,
    rows_parsed   INTEGER     NOT NULL DEFAULT 0,
    parse_status  TEXT        NOT NULL DEFAULT 'ok',   -- ok | zero_rows | error
    parse_error   TEXT,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- 3. PUBLISHED LAYER: the numbers the website reads.
--    Simple average, per your spec. Both senders count.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW freight_index_daily AS
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
GROUP BY quote_date, origin_port, dest_port;


-- Latest observation per lane (the "as of" number on the page).
CREATE OR REPLACE VIEW freight_index_latest AS
SELECT DISTINCT ON (origin_port, dest_port) *
FROM freight_index_daily
ORDER BY origin_port, dest_port, quote_date DESC;


-- ------------------------------------------------------------
-- 4. HEALTH: has the pipeline gone quiet?
--    Irregular sends are normal; 14+ days of silence is not.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW freight_pipeline_health AS
SELECT
    MAX(quote_date)                                   AS last_quote_date,
    (CURRENT_DATE - MAX(quote_date))                  AS days_since_last,
    (SELECT COUNT(*) FROM freight_quotes
      WHERE ingested_at > now() - INTERVAL '30 days') AS rows_last_30d,
    (SELECT COUNT(*) FROM freight_mail_log
      WHERE parse_status <> 'ok'
        AND processed_at > now() - INTERVAL '30 days') AS failed_mails_30d
FROM freight_quotes;
