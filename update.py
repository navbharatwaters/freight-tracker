#!/usr/bin/env python3
"""
update.py -- the only command you need to run.

Daily:   drag each rate email into mails/ as .eml (or paste the body into
         mails/2026-07-18.txt -- the filename becomes the date).
Weekly:  python update.py

Reads every mail in mails/ AND fixtures/emails/, parses them, and writes:
    data/rates.csv       every carrier quote, one row each
    data/index.json      daily averages per lane -- what the chart reads
    web/data.js          same, as a JS constant you can paste into the page

Safe to re-run. It rebuilds from scratch every time, so nothing accumulates
twice and a parser fix retroactively corrects your whole history.
"""
import csv
import glob
import json
import os
import re
import statistics
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "parser"))

from extract import (  # noqa: E402
    header_date, header_message_id, header_sender, load_msg, msg_text,
    original_date, original_sender, parse,
)

MAIL_DIRS = [ROOT / "mails", ROOT / "fixtures" / "emails"]
OUT = ROOT / "data"

# Flat markup on every PUBLISHED rate, both box sizes. Ocean Star's mailed
# rates are wholesale (agency-only); booking adds ~300-400 USD fuel/currency
# surcharges. The chart shows OUR rate. Applied to index.json only --
# rates.csv stays the raw quote, and so does the parser fixture.
# Production reads the amount from the markup_rules table (editable in
# /admin, dated, see db/migration_004_markup_rules.sql). This static path has
# no database, so it stays a flat constant equal to the table's SEED row.
# Dev/offline fallback only -- it does not follow later admin changes.
MARKUP_USD = 300
DATE_IN_NAME = re.compile(r"(\d{4})[-_]?(\d{2})[-_]?(\d{2})")


def from_txt(path):
    """Plain-text paste. Date comes from the filename."""
    m = DATE_IN_NAME.search(path.name)
    if not m:
        print(f"  !! {path.name}: no YYYY-MM-DD in filename, skipped")
        return []
    d = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
    return parse(path.read_text(errors="replace"), d, "manual_paste", path.name)


def from_eml(path):
    msg = load_msg(str(path))
    txt = msg_text(msg)
    # Forward -> body carries the original send date and rep. Direct mail from
    # the agent has no "Sent:" block, so the headers ARE the original.
    d = original_date(txt) or header_date(msg)
    if not d:
        print(f"  !! {path.name}: no usable date, skipped")
        return []
    sender = original_sender(txt) or header_sender(msg)
    return parse(txt, d, sender, path.name, header_message_id(msg))


def main():
    OUT.mkdir(exist_ok=True)
    rows, seen = [], set()

    files = []
    for d in MAIL_DIRS:
        if d.exists():
            files += sorted(glob.glob(str(d / "*.eml"))) + sorted(glob.glob(str(d / "*.txt")))

    if not files:
        print("No mails found. Drop .eml files into mails/ and re-run.")
        return

    print(f"Reading {len(files)} files...\n")
    for f in files:
        p = Path(f)
        got = from_txt(p) if p.suffix == ".txt" else from_eml(p)
        # Row-level dedupe on the schema's unique key, plus sender.
        #
        # A file-level check is not enough: the same mail arrives twice -- once
        # direct from the agent, once as a forward -- under two filenames, two
        # Message-IDs and two row counts (the forward loses a few lines to
        # quoting). Only the row identity catches that.
        #
        # SENDER is part of the key on purpose. Both reps quote the same lanes
        # on the same day and both quotes are real: drop sender and 17 Jul
        # Shenzhen -> Nhava Sheva collapses from n=26 to n=17. Keeping it also
        # preserves a mail that legitimately repeats a carrier (two sailings,
        # a via-Mundra option) -- those differ in raw_line.
        kept = 0
        for r in got:
            k = (str(r["quote_date"]), r["origin_port"], r["dest_port"],
                 r["source"], r.get("sender") or "", r["raw_line"])
            if k in seen:
                continue
            seen.add(k)
            rows.append(r)
            kept += 1
        dup = len(got) - kept
        note = f"  ({dup} dup)" if dup else ""
        print(f"  {p.name[:52]:52s} {kept:4d} rows{note}")

    if not rows:
        print("\nParsed 0 rows. Check that the mails contain 'PORT TO PORT' headers.")
        return

    # --- rates.csv
    cols = ["quote_date", "origin_port", "dest_port", "rate_20", "rate_40",
            "source", "sender", "raw_line", "src_file"]
    # utf-8 explicitly: the agent's HTML carries fullwidth punctuation
    # (（, ！) which the Windows default cp1252 codec cannot encode.
    with open(OUT / "rates.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})

    # --- index.json  (daily mean per lane; plain average + MARKUP_USD, per spec)
    agg = defaultdict(lambda: {"r20": [], "r40": []})
    for r in rows:
        k = (str(r["quote_date"]), r["origin_port"], r["dest_port"])
        if r["rate_20"] != "":
            agg[k]["r20"].append(int(r["rate_20"]))
        if r["rate_40"] != "":
            agg[k]["r40"].append(int(r["rate_40"]))

    idx = [{
        "date": d, "origin": o, "dest": dest,
        "rate20": round(statistics.mean(v["r20"])) + MARKUP_USD if v["r20"] else None,
        "rate40": round(statistics.mean(v["r40"])) + MARKUP_USD if v["r40"] else None,
        "n20": len(v["r20"]), "n40": len(v["r40"]),
    } for (d, o, dest), v in sorted(agg.items())]

    # newline="\n": on Windows the default would write CRLF and churn the
    # whole committed file.
    (OUT / "index.json").write_text(json.dumps(idx, indent=1), encoding="utf-8", newline="\n")
    (ROOT / "web" / "data.js").write_text(
        "// Auto-generated by update.py -- do not edit by hand.\n"
        "export const INDEX_DATA = " + json.dumps(idx, separators=(",", ":")) + ";\n",
        encoding="utf-8", newline="\n",
    )

    dates = sorted({r["date"] for r in idx})
    lanes = {(r["origin"], r["dest"]) for r in idx}
    print(f"\n{'-' * 58}")
    print(f"  {len(rows):,} quotes   {len(dates)} dates   {len(lanes)} lanes")
    print(f"  {dates[0]} -> {dates[-1]}")
    print(f"{'-' * 58}")
    print("  data/rates.csv")
    print("  data/index.json")
    print("  web/data.js")

    latest = dates[-1]
    hot = [r for r in idx if r["date"] == latest and r["dest"] == "NHAVA SHEVA"]
    if hot:
        print(f"\n  Nhava Sheva, {latest}:")
        for r in sorted(hot, key=lambda x: -(x["rate40"] or 0)):
            r20 = f"${r['rate20']}" if r["rate20"] else "--"
            r40 = f"${r['rate40']}" if r["rate40"] else "--"
            print(f"    {r['origin']:10s} 20ft {r20:>6s}  40ft {r40:>6s}  ({r['n40']} quotes)")

    stale = (datetime.now().date() - datetime.fromisoformat(dates[-1]).date()).days
    if stale > 14:
        print(f"\n  ** No new rates in {stale} days. Check the mail is still arriving. **")


if __name__ == "__main__":
    main()
