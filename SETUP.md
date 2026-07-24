# Freight Tracker — Setup

## Files

| File | What it is |
|---|---|
| `schema.sql` | Postgres tables + views |
| `backfill.sql` | 1,549 quotes from the 14 archived emails. **Run once.** |
| `n8n_parse.js` | Code node for the live ingestion workflow |
| `extract.py` | Offline parser for `.eml` folders (backup / re-import path) |
| `ocean_star_rates.csv` | The extracted archive, human-readable |
| `freight-tracker.jsx` | Reference UI for the web team |

## Order

```bash
psql $DB -f schema.sql
psql $DB -f backfill.sql          # ONCE. It has no ON CONFLICT guard.
psql $DB -c "SELECT * FROM freight_pipeline_health;"
```

Expect: `last_quote_date = 2026-07-17`, `rows_last_30d = 1549`.

## n8n workflow

```
Gmail Trigger  (poll 15 min, q: from:oceanstarsz.com)
  → Code node   (paste n8n_parse.js, "Run Once for All Items")
  → IF          ({{ $json.__log === true }})
      true  → Postgres: upsert freight_mail_log on message_id
      false → Postgres: insert freight_quotes, ON CONFLICT DO NOTHING
```

The `ON CONFLICT DO NOTHING` plus the unique index on
`(message_id, origin_port, dest_port, raw_line)` makes re-runs safe. Replaying
the same mail inserts zero rows.

## Adding a port

The parser rejects unknown lane headers by design — this is what stops
"Good day to you" becoming a shipping route. When the agent adds a port,
add it to `ORIGINS` in **both** `n8n_parse.js` and `extract.py`, or its rates
are silently dropped.

Catch it with:

```sql
SELECT parse_status, rows_parsed, subject
FROM freight_mail_log
WHERE processed_at > now() - INTERVAL '7 days'
ORDER BY sent_at DESC;
```

A mail with `rows_parsed` far below ~60, or `zero_rows`, means the format
moved or a lane went unrecognised.

## Adding a second agency

1. New Gmail filter → duplicate the workflow.
2. Change `source: 'ocean_star'` to the new agency's tag.
3. Decide before you publish: does the tracker average across agencies, or
   show them separately? `freight_index_daily` currently averages everything
   together, which silently blends two different books.

Until then `n_senders` and `sources` on the view tell you what went into
each number.

## Health check

```sql
SELECT * FROM freight_pipeline_health;
```

`days_since_last` is the one to watch. Sends are irregular — 5–8 day gaps are
normal — but past ~14 days something is broken: OAuth expired, the agent
changed address, a filter is eating the mail. Wire it to a weekly alert.
