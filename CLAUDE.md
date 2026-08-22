# Freight Tracker

China → India ocean freight rate tracker. Parses rate emails from a freight
agency, stores every carrier quote, publishes averaged trend lines.

## Ground rules

**Do not rewrite the parser matching logic.** `parser/extract.py` and
`parser/n8n_parse.js` look like generic text parsing. They are not. Every
branch handles a real case found in production email:

- `USD1500/40HQ` → 40ft only, 20ft is NULL
- `USD1600/20GP` → 20ft only, 40ft is NULL
- `USD1525/1575` → both
- HTML bodies contain non-breaking spaces: `NHAVA\u00a0SHEVA`. Without
  normalisation this silently splits one lane into two.
- The lane-header regex `/^X TO Y$/` also matches the greeting
  "Good day to you". Hence the `ORIGINS` whitelist. Removing it reintroduces
  67 phantom rows under origin `GOOD DAY`, destination `YOU`.
- Forwarded mail carries the forward date in the header. The real send date
  is in the body. Never take `quote_date` from a forwarded header.
- Mail received **direct** from the agent has no `Sent:` block at all, so
  there the RFC `Date:`/`From:` headers *are* the original and are the only
  source. Body first, header as fallback — never the other way round.
- `raw_line` is whitespace-normalised (NBSP included) before storage. It is
  part of the dedupe key, so both parsers must normalise identically or the
  same quote stores twice.

Extending is fine. Rewriting from scratch loses all of the above, because
these cases are in the fixture, not in general knowledge.

**The two parsers must stay in sync.** Python is for offline `.eml` batches,
JS runs in the n8n Code node. They must produce identical output. Change one,
change the other, re-run tests.

**Run `db/backfill.sql` exactly once.** It has no `ON CONFLICT` guard — the
archived rows have NULL `message_id` (forwards lose the header), and the
unique index is partial `WHERE message_id IS NOT NULL`. Running it twice
doubles the history.

**Store raw, aggregate on read.** `freight_quotes` holds every quote line
verbatim. `freight_index_daily` is a VIEW. Do not add a stored aggregates
table — methodology will change, and recomputation must stay possible.

**Averaging is a plain mean, deliberately.** Not trimmed, not weighted. The
business decided this. If you think outliers are a problem, say so; don't
change it.

## Data facts

- 10,508 quotes, 86 emails, 6 Mar – 21 Aug 2026, 66 distinct quote dates
- Two archives, overlapping: `fixtures/emails/` (14 forwards, the regression
  set) and `mails/` (72 direct mails). ~1,300 rows appear in both — the *same*
  mail, once direct and once forwarded. Dedupe is row-level, not file-level.
- One real 63-day hole, 25 Mar → 27 May 2026. No mail was archived. The chart
  breaks the line across it. Never interpolate it.
- Rates roughly tripled off the mid-July floor: Shenzhen → Nhava Sheva 40ft
  ran $1,586 (17 Jul) → $2,881 (21 Aug).
- 9 origin ports → 3 destinations (Nhava Sheva, Chennai, Kolkata)
- Agent writes `CCU` for Kolkata — normalise on ingest
- Two senders, one agency: `as01@` and `as23@oceanstarsz.com`
- 17 Jul has both senders on the same lanes → n=26 instead of ~13. Expected.
- Emails arrive **irregularly** — when rates move, not daily. Gaps of 5–8
  days are normal. Never interpolate across them.

## Regression fixture

`fixtures/ocean_star_rates.csv` is known-good parser output **over
`fixtures/emails/` only** — 14 forwards, not the whole archive. Any parser
change must still yield:

- 1,541 rows total
- Shenzhen → Nhava Sheva, 2026-07-17: 20ft mean **$1560** (n=20),
  40ft mean **$1586** (n=26)
- Zero rows with `origin_port` not in the `ORIGINS` whitelist

## Adding a port

The parser drops unrecognised lane headers by design. When the agent adds a
port, add it to `ORIGINS` in **both** parsers. Detect misses via
`freight_mail_log.rows_parsed` dropping well below ~60.

## Safety

- Local/dev Postgres only. Never point migrations at production.
- Credentials in `.env`, gitignored. Never hardcode a connection string.

## Stack

Postgres · n8n ingestion · FastAPI read API · React + Recharts frontend
