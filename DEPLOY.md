# Deploy runbook

## The box

| | |
|---|---|
| Host | `newdev` on Tailscale — `ssh newdev` (user `root`, key auth) |
| Tailscale IP | `100.95.197.116` · public v4 `169.58.84.65` |
| App dir | `/opt/apps/freight-tracker` |
| Service | `freight-tracker.service` (`npm run start -- -H 127.0.0.1`, port 3007) |
| Env | `/opt/apps/freight-tracker/.env` — holds `DATABASE_URL` |
| Front | Caddy, `/etc/caddy/Caddyfile` line 41. Basic auth covers `/admin`, `/admin/*` **and** `/api/admin/*` |
| Database | Postgres on the same host |

Other apps share this box (`nwpl-website`, `export-boe`) — restart
`freight-tracker.service` specifically, never all of Caddy's backends.

**There is no CI and no auto-deploy.** New code reaches production only when
someone runs the steps below by hand.

## Do not reintroduce a Python dependency in the request path

The `/admin` ingest was broken in production because the API route shelled out
to `python3 parser/ingest_eml.py`. The box has `python3` and the `parser/`
directory, but **not `beautifulsoup4`**, so `extract.py` failed at import and
every upload and paste returned a parser error.

Parsing now runs in process via `lib/parse-mail.ts`. Keep it that way: the
request path must not depend on a Python interpreter, a pip package, or files
outside the Next build output. `parser/*.py` is for offline batches only.

## The partner embed (iKargos)

`/embed` is the only framable path. Two things must agree, or framing breaks:

- `next.config.mjs` sends `Content-Security-Policy: frame-ancestors` on
  `/embed` only. **The origin allowlist lives there, in git** — not in Caddy.
- The Caddyfile `@embed` / `@notembed` split stops sending
  `X-Frame-Options: SAMEORIGIN` on `/embed` only. Caddy adds it to every
  response otherwise, and relying on CSP to override XFO is a thin margin for
  a partner-facing page.

Adding a partner origin is a one-line change in `next.config.mjs` and a
redeploy. Nothing in Caddy, nothing on the partner's server.

After any Caddyfile change, re-verify all four boundaries:

```bash
B=https://tracker.navbharatwater.us
curl -s -D - -o /dev/null $B/embed | grep -iE 'content-security-policy|x-frame'  # CSP, no XFO
curl -s -D - -o /dev/null $B/      | grep -iE 'content-security-policy|x-frame'  # XFO, no CSP
curl -s -o /dev/null -w '%{http_code}\n' $B/admin                                # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/api/admin/ingest             # 401
```

Handoff for the partner's developers: `docs/ikargos-embed-handoff.md`.

### Known gap: no rate limiting on the public API

`/api/index/*` is public and uncapped. The DB is protected — ISR collapses all
traffic to one query per 15 minutes — so the exposure is bandwidth and CPU
serving cached JSON, the same as any public page.

It is not fixed because stock Caddy has no `rate_limit` module. Adding it means
rebuilding the binary with `xcaddy` and swapping the proxy that fronts three
production apps (`freight-tracker`, `nwpl-website`, `export-boe`). That is a
worse risk than the exposure. If it becomes a real problem, put Cloudflare in
front, or do the `xcaddy` rebuild in a maintenance window with all three sites
verified afterwards.

## Order matters

The app now infers its `ON CONFLICT` target from a **new** unique index. Deploy
the code before the migration and every ingest fails with:

```
42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

So: **migrate first, deploy second.** Steps 1–5 are safe and reversible; step 6
is the point of no return for the schema, and step 8 swaps the running code.

---

## 1. Connect

```bash
ssh newdev
APP=/opt/apps/freight-tracker
cd "$APP"
systemctl is-active freight-tracker.service      # expect: active
```

## 2. Confirm the database URL the app actually uses

Read it from the app's own environment — do not retype the password anywhere.

```bash
grep -c DATABASE_URL "$APP/.env"     # expect 1
set -a; . "$APP/.env"; set +a
psql "$DATABASE_URL" -c 'SELECT current_database(), current_user;'
```

## 3. Record the current state, so you can tell if anything moved

```bash
psql "$DATABASE_URL" -c 'SELECT count(*) AS quotes, max(quote_date) AS latest FROM freight_quotes;'
psql "$DATABASE_URL" -c "\d freight_quotes"
```

Keep that row count. Step 7 must show the **same** number — the migration
changes an index, never data.

## 4. Back up first

```bash
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/freight-$(date +%F-%H%M).dump"
ls -lh /var/backups/freight-*.dump | tail -1
```

Do not continue until this file exists and is non-trivial in size.

## 5. Smoke-test the new ON CONFLICT clause — inside a transaction, rolled back

This is the step that catches a bad expression-index inference **before** it can
reach a user. It writes nothing: the `ROLLBACK` is unconditional.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE UNIQUE INDEX uq_smoke_test
    ON freight_quotes (quote_date, origin_port, dest_port, source,
                       (COALESCE(sender, '')), raw_line);
INSERT INTO freight_quotes
  (quote_date, origin_port, dest_port, rate_20, rate_40, source, sender, message_id, raw_line)
VALUES ('2026-01-01','SHENZHEN','NHAVA SHEVA',100,100,'smoke_test','x@example.com','<smoke>','SMOKE USD100/100')
ON CONFLICT (quote_date, origin_port, dest_port, source, (COALESCE(sender, '')), raw_line)
  DO NOTHING;
ROLLBACK;
SQL
```

**Expected:** `ROLLBACK` and no error. If it raises `42P10`, stop — the
inference does not match and deploying would break ingest.

## 6. Run the migration

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP/db/migration_001_dedupe_sender.sql"
```

It is one transaction: build the new index, drop the old, rename. The new index
is strictly more permissive than the old one, so it always builds over existing
data.

### 6b. Migration 003 — +$300 published markup (2026-09-19)

Run after 001 (order does not actually matter; it only replaces two views).
No `pg_dump` restore is ever needed for it — it touches no table.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP/db/migration_003_markup.sql"
psql "$DATABASE_URL" -c "SELECT quote_date, rate_20, rate_40, markup_usd FROM freight_index_daily WHERE origin_port='SHENZHEN' AND dest_port='NHAVA SHEVA' AND quote_date='2026-07-17';"
```

**Expected:** `1860 | 1886 | 300`. If you see `1560 | 1586` the view did not
replace. The site picks it up on the next request — the Node code already
reads whatever the view returns; there is nothing to redeploy for this step,
and nothing to re-ingest. Rollback = re-run the view block from `db/schema.sql`
at commit `83e0440`.

## 7. Verify the schema and that no data moved

```bash
psql "$DATABASE_URL" -c "\d freight_quotes" | grep -A2 uq_freight_quotes_dedupe
psql "$DATABASE_URL" -c 'SELECT count(*) AS quotes, max(quote_date) AS latest FROM freight_quotes;'
```

The index must now list `COALESCE(sender, ''::text)`. The count must equal
step 3.

## 8. Deploy the code

```bash
cd "$APP"
git pull origin main
npm ci
npm run build
systemctl restart freight-tracker.service
systemctl status freight-tracker.service --no-pager | head -20
```

`npm ci`, not `npm install` — this release includes the Next.js 15.1.9 patch
for CVE-2025-66478 and `ci` installs the locked versions exactly.

## 9. Verify end to end

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://tracker.navbharatwater.us/
curl -s https://tracker.navbharatwater.us/api/health
```

Then, signed in to `/admin`, paste this into the box with any date and press
**Parse & insert**:

```
SHENZHEN TO NHAVA SHEVA
EMC USD1525/1575 CLS22-Jul
```

**Expected:** `parsed 1 · inserted 1 · skipped 0`. Press it a second time —
the same input must report `inserted 0 · skipped 1`, which proves dedupe works
against the new index. Then remove the test row:

```bash
psql "$DATABASE_URL" -c "DELETE FROM freight_quotes WHERE raw_line = 'EMC USD1525/1575 CLS22-Jul' AND quote_date = '<the date you used>';"
psql "$DATABASE_URL" -c "DELETE FROM freight_mail_log WHERE subject = 'pasted body' AND rows_parsed = 1;"
```

## Rollback

Code only:

```bash
git reset --hard 0504077 && npm ci && npm run build && systemctl restart freight-tracker.service
```

Schema (only if the migration itself is the problem):

```bash
psql "$DATABASE_URL" <<'SQL'
BEGIN;
CREATE UNIQUE INDEX uq_freight_quotes_dedupe_v1
    ON freight_quotes (quote_date, origin_port, dest_port, source, raw_line);
DROP INDEX uq_freight_quotes_dedupe;
ALTER INDEX uq_freight_quotes_dedupe_v1 RENAME TO uq_freight_quotes_dedupe;
COMMIT;
SQL
```

The old index is **stricter**, so it can fail to build if duplicate rows have
been ingested since the migration. In that case restore the step-4 dump instead.

---

## Note: this host was compromised on 2026-07-28

Twice, via the Next.js RCE patched in `0504077` — an XMRig miner was installed
as `/var/tmp/cpu-logind` with an `@reboot` crontab. While you are on the box it
is worth confirming it has not come back:

```bash
crontab -l; ls -la /var/tmp/ | grep -i logind; pgrep -af 'xmrig|cpu-logind'
```

Nothing should match.
