-- ============================================================
-- Migration 001: put sender into the dedupe key.
--
-- Run once, on any database created before this migration existed.
-- A fresh database built from schema.sql already has the new index and
-- does not need this.
--
-- WHY
-- The old key was (quote_date, origin_port, dest_port, source, raw_line).
-- Two things broke under it:
--
--   1. Both reps (as01@ / as23@) quote the same lanes on the same day, and
--      both quotes are real. Without sender they collapse into one:
--      17 Jul Shenzhen -> Nhava Sheva drops from n=26 to n=17.
--
--   2. The same mail arrives twice -- direct from the agent AND forwarded on
--      -- under two Message-IDs. Sender is identical on both, so those still
--      dedupe correctly. That is the case the key must keep catching.
--
-- COALESCE(sender, '') rather than bare sender: a UNIQUE index treats NULLs
-- as distinct, so a NULL-sender row would never collide with anything.
--
-- SAFETY
-- This index is STRICTLY MORE PERMISSIVE than the one it replaces -- it can
-- only split groups, never merge them. So it always builds cleanly over
-- existing data. It does not retroactively restore rows an earlier ingest
-- discarded; re-run those mails through /admin afterwards if you need them.
-- ============================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_freight_quotes_dedupe_v2
    ON freight_quotes (quote_date, origin_port, dest_port, source,
                       COALESCE(sender, ''), raw_line);

DROP INDEX IF EXISTS uq_freight_quotes_dedupe;

ALTER INDEX uq_freight_quotes_dedupe_v2 RENAME TO uq_freight_quotes_dedupe;

COMMIT;
