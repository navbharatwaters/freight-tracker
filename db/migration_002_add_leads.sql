-- ============================================================
-- Leads: booking enquiries submitted from the "Contact us" form
-- below the chart (both the standalone page and the /embed page).
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    phone         TEXT,
    company       TEXT,

    origin_port   TEXT,                  -- lane the visitor was viewing, if any
    dest_port     TEXT,
    message       TEXT,

    source        TEXT        NOT NULL DEFAULT 'tracker_web',  -- 'tracker_web' | 'tracker_embed'
    notified      BOOLEAN     NOT NULL DEFAULT false           -- did the email alert go out
);

CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads (created_at DESC);
