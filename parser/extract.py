#!/usr/bin/env python3
"""Extract freight rates from Ocean Star .eml archive -> CSV."""
import email, glob, os, re, csv, sys
from email import policy
from datetime import datetime
from bs4 import BeautifulSoup

RATE_RE = re.compile(r'USD\s*(\d{3,5})\s*/\s*(\d{3,5}|40HQ|40GP|20GP)', re.I)
PORT_RE = re.compile(r'^([A-Z][A-Z\s.&\-]*?)\s+TO\s+([A-Z][A-Z\s.&\-]*?)\s*$', re.I)
SENT_RE = re.compile(r'Sent:?\s*\n?\s*(\d{1,2}\s+\w+\s+\d{4})', re.I)
FROM_RE = re.compile(r'From:?\s*\n?\s*([^<\n]+)<([^>]+)>', re.I)

def body_text(path):
    m = email.message_from_file(open(path, errors='replace'), policy=policy.default)
    b = m.get_body(preferencelist=('html', 'plain'))
    if not b:
        return ''
    t = b.get_content()
    if b.get_content_type() == 'text/html':
        t = BeautifulSoup(t, 'html.parser').get_text('\n')
    return t

def original_date(txt):
    m = SENT_RE.search(txt)
    if not m:
        return None
    for fmt in ('%d %B %Y', '%d %b %Y'):
        try:
            return datetime.strptime(m.group(1).strip(), fmt).date()
        except ValueError:
            pass
    return None

def original_sender(txt):
    m = FROM_RE.search(txt)
    return m.group(2).strip().lower() if m else None

ORIGINS = {'SHENZHEN','SHEKOU','NANSHA','NINGBO','SHANGHAI','QINGDAO',
           'TIANJIN','XIAMEN','DALIAN','GUANGZHOU','FUZHOU','YANTIAN'}
DEST_ALIAS = {'CCU':'KOLKATA','NHAVA SHEVA':'NHAVA SHEVA','CHENNAI':'CHENNAI',
              'KOLKATA':'KOLKATA','MUNDRA':'MUNDRA'}

def parse(txt, qdate, sender, srcfile):
    rows, port = [], None
    for raw in txt.split('\n'):
        line = raw.strip()
        if not line or len(line) > 120:
            continue
        p = PORT_RE.match(line)
        if p and not RATE_RE.search(line):
            o = re.sub(r'\s+', ' ', p.group(1).replace('\xa0', ' ')).strip().upper()
            d = re.sub(r'\s+', ' ', p.group(2).replace('\xa0', ' ')).strip().upper()
            if o in ORIGINS and d in DEST_ALIAS:
                port = (o, DEST_ALIAS[d])
            else:
                port = None          # unknown header -> stop collecting
            continue
        r = RATE_RE.search(line)
        if not r or not port:
            continue
        a, b = r.group(1), r.group(2)
        if re.match(r'40HQ|40GP', b, re.I):      # "USD1500/40HQ" -> 40ft only
            r20, r40 = '', int(a)
        elif re.match(r'20GP', b, re.I):         # "USD1600/20GP" -> 20ft only
            r20, r40 = int(a), ''
        else:                                     # "USD1525/1575" -> both
            r20, r40 = int(a), int(b)
        # Agent typos exist: "USD21950/1950" is a fat-fingered 1950/1950.
        # A 5-digit 20ft against a 4-digit 40ft is never a real quote.
        def sane(v):
            return v == '' or (100 <= v <= 20000)
        if not sane(r20) or not sane(r40):
            continue
        if r20 != '' and r40 != '' and (r20 > r40 * 2 or r40 > r20 * 3):
            continue          # implausible spread -> almost certainly a typo

        rows.append({
            'quote_date': qdate, 'origin_port': port[0], 'dest_port': port[1],
            'rate_20': r20, 'rate_40': r40,
            'source': 'ocean_star', 'sender': sender or '',
            'raw_line': line[:200], 'src_file': srcfile,
        })
    return rows

def main(folder, out):
    allrows, report = [], []
    for f in sorted(glob.glob(os.path.join(folder, '*.eml'))):
        txt = body_text(f)
        d, s = original_date(txt), original_sender(txt)
        rows = parse(txt, d, s, os.path.basename(f))
        allrows += rows
        report.append((os.path.basename(f)[:52], d, s, len(rows),
                       len({r['origin_port'] for r in rows}),
                       sorted({r['dest_port'] for r in rows})))

    print(f"{'FILE':54s} {'DATE':11s} {'SENDER':22s} {'ROWS':>5s} {'ORIG':>5s}  DESTS")
    print('-' * 118)
    for r in report:
        print(f"{r[0]:54s} {str(r[1]):11s} {str(r[2])[:22]:22s} {r[3]:5d} {r[4]:5d}  {','.join(r[5])[:28]}")

    with open(out, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(allrows[0].keys()))
        w.writeheader()
        w.writerows(allrows)

    dates = sorted({r['quote_date'] for r in allrows if r['quote_date']})
    print(f"\nTOTAL ROWS : {len(allrows)}")
    print(f"DATE RANGE : {dates[0]} -> {dates[-1]}  ({len(dates)} distinct days)")
    print(f"DAYS       : {', '.join(str(d) for d in dates)}")
    print(f"DESTS      : {sorted({r['dest_port'] for r in allrows})}")
    print(f"ORIGINS    : {sorted({r['origin_port'] for r in allrows})}")
    print(f"\nWrote {out}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
