# TODO

## Update the n8n Code node with the fixed parser

**Status:** open · raised 2026-08-22 · affects live ingestion

The n8n Code node runs its own pasted copy of `parser/n8n_parse.js`. Fixing the
file in this repo does **not** change what n8n executes. Until the node is
updated by hand, every mail arriving through the live pipeline keeps losing
rows.

### What is wrong with the deployed copy

`htmlToText` collapses every remaining HTML tag to a **space**:

```js
.replace(/<[^>]+>/g, ' ')      // deployed n8n node — WRONG
```

BeautifulSoup's `get_text('\n')`, which `parser/extract.py` uses, puts a
separator between every text node instead. With a space, a lane's rate block
merges into one long line, and the `line.length > 120` guard then silently
drops it. Measured cost: **17 rows across the forwarded mails**, all ICD lines
like `CMA via pip/mun USD3314/40HQ ETD 11-JULY`.

The repo copy is already fixed:

```js
.replace(/<[^>]+>/g, '\n')     // parser/n8n_parse.js — correct
```

Note this is a silent failure. Rows are not rejected or logged; they simply
never match, so `freight_mail_log.rows_parsed` looks plausible and nothing
alerts.

### How to fix

1. Open the n8n workflow → the **"Parse Ocean Star rate mail"** Code node.
2. Replace its entire contents with the current `parser/n8n_parse.js`.
   Take the whole file, not just the one line — the same copy also gained the
   body-first date/sender fallback (a forward's header carries the forward
   date, so the body must win; direct mail has no `Sent:` block and the header
   is then the only source).
3. Save and activate.

### How to verify it worked

After the next mail arrives through n8n:

```sql
SELECT message_id, sent_at::date, rows_parsed
FROM freight_mail_log
ORDER BY processed_at DESC LIMIT 5;
```

`rows_parsed` should sit around 60+ per lane-set, in the same range as a mail
ingested through `/admin`. A number well below ~60 is the signal that lane
headers are being missed (see "Adding a port" in CLAUDE.md).

To check the specific bug is gone, confirm ICD lines survive:

```sql
SELECT count(*) FROM freight_quotes
WHERE raw_line LIKE '%via pip/mun%' AND quote_date >= CURRENT_DATE - 7;
```

### Related

- `tests/xcheck_parsers.mjs` pins `lib/parse-mail.ts` against
  `parser/extract.py` (86 mails, 12,658 rows, 0 divergent). It does **not**
  cover `parser/n8n_parse.js`, and nothing can cover the copy pasted inside
  n8n. That gap is why this drifted unnoticed.
- `/admin` ingest is unaffected — it uses `lib/parse-mail.ts` in process and is
  already correct in production.
