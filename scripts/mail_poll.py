#!/usr/bin/env python3
"""
mail_poll.py -- pulls new rate mails from the freight-rates@ mailbox and
ingests them through the app's own /api/admin/ingest endpoint (in-process
TS parser, no Python parsing here -- see DEPLOY.md "Do not reintroduce a
Python dependency in the request path").

Runs on the same box as the app, talks to it over loopback only:
127.0.0.1:3007 -- bypasses Caddy/basic-auth entirely, so no admin
credential is needed here, only the mailbox password.

Config comes from env (see mail-poll.env, chmod 600, loaded by the
systemd unit): IMAP_HOST, IMAP_USER, IMAP_PASS.

Successfully ingested mail is moved to "Processed"; a mail whose POST
fails outright (network/app down) is left unseen so it retries next run.
A mail that the app parses but flags with errors is moved to "Failed" so
it stops being retried forever and shows up for a human to look at.
"""
import email
import imaplib
import json
import os
import re
import sys
import urllib.request
import uuid
from datetime import datetime, timezone

IMAP_HOST = os.environ["IMAP_HOST"]
IMAP_USER = os.environ["IMAP_USER"]
IMAP_PASS = os.environ["IMAP_PASS"]
INGEST_URL = os.environ.get("INGEST_URL", "http://127.0.0.1:3007/api/admin/ingest")
LOG_FILE = os.environ.get("MAIL_POLL_LOG", "/opt/apps/freight-tracker/mail-poll.log")

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def log(msg):
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def ensure_folder(conn, name):
    typ, _ = conn.select(name, readonly=True)
    if typ != "OK":
        conn.create(name)
    conn.select("INBOX")


def post_eml(filename, raw_bytes):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        f"Content-Type: message/rfc822\r\n\r\n"
    ).encode("utf-8") + raw_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        INGEST_URL,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    conn = imaplib.IMAP4_SSL(IMAP_HOST)
    conn.login(IMAP_USER, IMAP_PASS)
    ensure_folder(conn, "Processed")
    ensure_folder(conn, "Failed")
    conn.select("INBOX")

    typ, data = conn.search(None, "UNSEEN")
    if typ != "OK":
        log(f"search failed: {typ}")
        conn.logout()
        sys.exit(1)

    uids = data[0].split()
    if not uids:
        log("no new mail")
        conn.logout()
        return

    log(f"{len(uids)} new mail(s)")
    for uid in uids:
        typ, msg_data = conn.fetch(uid, "(RFC822)")
        if typ != "OK" or not msg_data or not msg_data[0]:
            log(f"  uid {uid.decode()}: fetch failed, left unseen")
            continue

        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)
        subject = msg.get("Subject", "no-subject")
        safe_subject = SAFE_NAME.sub("_", subject)[:60]
        filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uid.decode()}_{safe_subject}.eml"

        try:
            result = post_eml(filename, raw)
        except Exception as e:  # network/app down -- retry next run
            log(f"  uid {uid.decode()} ({subject!r}): POST failed, left unseen: {e}")
            continue

        errors = result.get("errors") or []
        results = result.get("results") or []
        parsed_total = sum(r.get("parsed", 0) for r in results)

        if errors or parsed_total == 0:
            log(f"  uid {uid.decode()} ({subject!r}): parsed 0 or errored -> Failed. "
                f"errors={errors} results={results}")
            conn.copy(uid, "Failed")
        else:
            inserted = sum(r.get("inserted", 0) for r in results)
            skipped = sum(r.get("skipped", 0) for r in results)
            log(f"  uid {uid.decode()} ({subject!r}): parsed {parsed_total} "
                f"inserted {inserted} skipped {skipped} -> Processed")
            conn.copy(uid, "Processed")

        conn.store(uid, "+FLAGS", "\\Seen \\Deleted")

    conn.expunge()
    conn.logout()


if __name__ == "__main__":
    main()
