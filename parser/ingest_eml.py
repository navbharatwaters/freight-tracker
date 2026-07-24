#!/usr/bin/env python3
"""Parse a single .eml (or pasted body) and emit JSON for the Node ingest route.

Modes:
  ingest_eml.py <path.eml>                    # parse .eml
  ingest_eml.py --paste --date YYYY-MM-DD [--sender addr]   # body on stdin

Output (stdout):
  {
    "message_id": "<optional>", "sent_at": "ISO8601 or null",
    "subject": "...", "sender": "email or null", "source": "ocean_star",
    "quote_date": "YYYY-MM-DD or null",
    "rows": [ {origin_port, dest_port, rate_20, rate_40, raw_line, sender, source}, ... ],
    "warnings": []
  }
"""
import argparse, email, json, os, sys
from email import policy
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import parse, body_text, original_date, original_sender


def load_eml(path: str):
    with open(path, errors="replace") as fh:
        m = email.message_from_file(fh, policy=policy.default)

    b = m.get_body(preferencelist=("html", "plain"))
    txt = ""
    if b:
        raw = b.get_content()
        if b.get_content_type() == "text/html":
            from bs4 import BeautifulSoup
            txt = BeautifulSoup(raw, "html.parser").get_text("\n")
        else:
            txt = raw

    subject = str(m.get("subject", "")).strip()
    message_id = (m.get("message-id") or "").strip() or None

    # Prefer the ORIGINAL sender embedded in a forwarded body; fall back to header.
    sender = original_sender(txt)
    if not sender:
        from_hdr = str(m.get("from", ""))
        if "<" in from_hdr and ">" in from_hdr:
            sender = from_hdr.split("<", 1)[1].split(">", 1)[0].strip().lower()
        else:
            sender = from_hdr.strip().lower() or None

    # Original send date from the forwarded body; fall back to message Date.
    qdate = original_date(txt)
    if qdate is None:
        try:
            d = email.utils.parsedate_to_datetime(m.get("date"))
            qdate = d.date() if d else None
        except (TypeError, ValueError):
            qdate = None

    sent_at = None
    try:
        d = email.utils.parsedate_to_datetime(m.get("date"))
        if d:
            sent_at = d.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        pass

    return {
        "text": txt, "subject": subject, "message_id": message_id,
        "sender": sender, "quote_date": qdate, "sent_at": sent_at,
    }


def build_output(meta, rows, warnings):
    return {
        "message_id": meta["message_id"],
        "sent_at": meta["sent_at"],
        "subject": meta["subject"],
        "sender": meta["sender"],
        "source": "ocean_star",
        "quote_date": meta["quote_date"].isoformat() if meta["quote_date"] else None,
        "rows": [
            {
                "quote_date": r["quote_date"].isoformat() if r["quote_date"] else None,
                "origin_port": r["origin_port"], "dest_port": r["dest_port"],
                "rate_20": r["rate_20"] if r["rate_20"] != "" else None,
                "rate_40": r["rate_40"] if r["rate_40"] != "" else None,
                "raw_line": r["raw_line"], "sender": r["sender"] or None,
                "source": r["source"],
            } for r in rows
        ],
        "warnings": warnings,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?")
    ap.add_argument("--paste", action="store_true")
    ap.add_argument("--date")
    ap.add_argument("--sender")
    ap.add_argument("--subject", default="")
    ap.add_argument("--message-id", dest="message_id", default=None)
    args = ap.parse_args()

    warnings = []

    if args.paste:
        if not args.date:
            print(json.dumps({"error": "--date required with --paste"}), file=sys.stderr)
            sys.exit(2)
        try:
            qdate = datetime.strptime(args.date, "%Y-%m-%d").date()
        except ValueError:
            print(json.dumps({"error": "date must be YYYY-MM-DD"}), file=sys.stderr)
            sys.exit(2)
        txt = sys.stdin.read()
        meta = {
            "text": txt, "subject": args.subject, "message_id": args.message_id,
            "sender": (args.sender or "").lower() or None,
            "quote_date": qdate, "sent_at": None,
        }
        srcfile = "paste"
    else:
        if not args.path:
            print(json.dumps({"error": "path or --paste required"}), file=sys.stderr)
            sys.exit(2)
        meta = load_eml(args.path)
        srcfile = os.path.basename(args.path)
        if meta["quote_date"] is None:
            warnings.append("could not determine quote_date from mail; rows dropped")

    if meta["quote_date"] is None and not args.paste:
        print(json.dumps(build_output(meta, [], warnings)))
        return

    rows = parse(meta["text"], meta["quote_date"], meta["sender"], srcfile)
    if not rows:
        warnings.append("no rate lines matched")

    print(json.dumps(build_output(meta, rows, warnings)))


if __name__ == "__main__":
    main()
