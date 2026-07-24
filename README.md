# Freight Tracker

China → India ocean freight rates. Parses agent rate emails, averages the
carrier quotes, plots the trend.

## Daily use (no database, no n8n)

**Every day the rate mail arrives:**

Drag it into `mails/` as a `.eml` file. That's the whole daily job.

*Outlook:* drag the mail from the list straight into the folder.
*Gmail:* ⋮ → Download message.

No `.eml`? Paste the mail body into a text file named with the date —
`mails/2026-07-18.txt` — and the filename becomes the date.

**Once a week:**

```bash
python update.py
```

Rebuilds everything from scratch and writes:

```
data/rates.csv     every carrier quote, one row each
data/index.json    daily averages per lane
web/data.js        same, ready to paste into the page
```

Safe to re-run any time. Because it rebuilds from the mails folder rather
than appending, a later parser fix retroactively corrects your whole history.

## What matters

**Save every mail, starting today.** The pipeline, the database, the page —
all of it can be rebuilt later from a folder of `.eml` files. A mail you
didn't save is a data point gone for good, and there are only 9 in the
archive. If you do nothing else with this repo, do this.

Mails arrive irregularly — when carriers revise pricing, not on a schedule.
Gaps of 5–8 days are normal. Past ~14 days, check the mail is still coming.

## Layout

```
mails/            <- drop new rate emails here (your only daily task)
data/             <- generated output, safe to delete and rebuild
update.py         <- the one command you run

parser/           extract.py (offline) + n8n_parse.js (for n8n later)
                  Keep the two in sync -- see CLAUDE.md
db/               schema.sql + backfill.sql, for when you move to Postgres
web/              freight-tracker.jsx -- reference UI for the web team
fixtures/         the 14 archived emails + known-good parser output
tests/            regression tests. Run: pytest tests/ -v
CLAUDE.md         ground rules -- read before changing the parser
SETUP.md          Postgres + n8n instructions for later
```

## Current data

1,541 quotes · 14 emails · 18 Jun – 17 Jul 2026 · 9 origins → 3 destinations

Shenzhen → Nhava Sheva 40ft fell from $2,185 to $1,586 over that window —
about −27%. That is a real market move, visible across every lane.

## When you outgrow this

Move to Postgres + n8n using `SETUP.md`. Nothing is wasted: `extract.py`
backfills every mail you saved along the way.

## Caveat that belongs on the page

Rates come from one freight forwarding agency and reflect that forwarder's
book, not the whole market. This indicates market *direction* only — it is
not a quotation. A second source is what would eventually make it an index.
