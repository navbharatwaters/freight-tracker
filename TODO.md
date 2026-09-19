# TODO

Nothing open.

Closed 2026-09-19: "Update the n8n Code node with the fixed parser" — stale.
n8n never went live for freight ingestion; the IMAP poll
(`scripts/mail_poll.py` → `/api/admin/ingest` → `lib/parse-mail.ts`) replaced
it on 2026-09-09 and `parse-mail.ts` already carries the `\n` tag-separator
fix. `parser/n8n_parse.js` remains the reference JS parser that
`lib/parse-mail.ts` is a literal port of, and is kept in sync by
`tests/xcheck_parsers.mjs`.
