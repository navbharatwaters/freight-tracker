# iKargos handoff — China → India freight rates page

Everything below happens in the **ikargos.com Next.js repo**. Nothing on the
tracker server, no nginx change, no CSP change, no environment variable, no
credentials. The API is public and read-only.

**Estimated work: one file, ~80 lines, about an hour.**

---

## Why the table is server-rendered and the chart is an iframe

The **table is the SEO**. It renders as real HTML inside ikargos.com's own DOM,
so Google attributes it to your page and it can rank for queries like *china to
india container rates* or *nhava sheva freight rate*.

The **chart is an iframe** on purpose:

- Google gets nothing from an SVG chart either way, so framing it costs no SEO.
- It stays origin-isolated: tracker JS never runs inside ikargos.com, and
  cannot read your DOM, cookies or session.
- Chart changes ship from the tracker deploy. You never touch it again.

## Why you will not have to edit this page again

The API returns its own `columns`, `heading` and `note`. Your component is a
blind `map()` over what it receives. Adding a lane, adding a column, rewording
the disclaimer or changing the averaging method is a deploy on the tracker side
and **zero work here**.

So: do not hard-code column names, do not format the numbers, do not compute
the percentages. They arrive ready to print.

---

## 1. The API

```
GET https://tracker.navbharatwater.us/api/index/summary
```

Public, anonymous, no key. Cached 15 minutes. Sample response (truncated):

```json
{
  "as_of": "2026-08-21",
  "heading": "China → India ocean freight — indicative spot rates",
  "columns": [
    { "key": "lane",  "label": "Lane" },
    { "key": "r20",   "label": "20ft",        "align": "right" },
    { "key": "r40",   "label": "40ft / 40HQ", "align": "right" },
    { "key": "n",     "label": "Quotes",      "align": "right" },
    { "key": "delta", "label": "30-day change", "align": "right" }
  ],
  "rows": [
    {
      "lane": "Shenzhen → Nhava Sheva",
      "origin": "SHENZHEN", "dest": "NHAVA SHEVA",
      "r20": "$2,733", "r40": "$2,881",
      "n": 10, "delta": "+35.7%",
      "as_of": "2026-08-21"
    }
  ],
  "note": "Each figure is the simple average of every carrier quotation…",
  "source": "db",
  "updated_at": "2026-08-22T14:02:11.000Z"
}
```

`rows[].origin` / `dest` / `as_of` are extra data you do not have to render.
They exist so we can add columns later without asking you to change anything.

---

## 2. The page

Drop this in as e.g. `app/intelligence/china-india-freight-rates/page.tsx`,
then swap the Tailwind classes for your own design system. It is a **server
component** — that is what makes the table crawlable. Do not add `'use client'`.

```tsx
import type { Metadata } from 'next';

const SUMMARY_URL = 'https://tracker.navbharatwater.us/api/index/summary';
const EMBED_URL = 'https://tracker.navbharatwater.us/embed';
const PAGE_URL = 'https://ikargos.com/intelligence/china-india-freight-rates';

type Column = { key: string; label: string; align?: 'left' | 'right' };
type Row = Record<string, string | number>;
type Summary = {
  as_of: string | null;
  heading: string;
  columns: Column[];
  rows: Row[];
  note: string;
};

export const metadata: Metadata = {
  title: 'China to India Freight Rates — Live Ocean Spot Rates | iKargos',
  description:
    'Current China to India ocean freight spot rates by lane. 20ft and 40ft averages from carrier quotations, updated weekly.',
  alternates: { canonical: PAGE_URL },
};

export const revalidate = 900;

export default async function Page() {
  // Server-side fetch: the rows must be in the HTML Google receives, so this
  // must NOT move into a client component or a useEffect.
  const res = await fetch(SUMMARY_URL, { next: { revalidate: 900 } });
  if (!res.ok) return <p>Rates are temporarily unavailable.</p>;
  const data: Summary = await res.json();

  return (
    <main>
      <h1>China → India Ocean Freight Rates</h1>
      <p>
        {data.heading}
        {data.as_of ? ` · as of ${data.as_of}` : ''}
      </p>

      <table>
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i}>
              {data.columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p>{data.note}</p>

      <h2>Rate trend by lane</h2>
      <iframe
        src={EMBED_URL}
        style={{ width: '100%', height: 'calc(100vh - 80px)', minHeight: 700, border: 0 }}
        title="China to India freight rate trend"
        loading="lazy"
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'China to India ocean freight spot rates',
            description: data.note,
            url: PAGE_URL,
            temporalCoverage: data.as_of ?? undefined,
            creator: { '@type': 'Organization', name: 'iKargos' },
          }),
        }}
      />
    </main>
  );
}
```

Then add the route to your nav and `sitemap.xml`.

---

## 3. How to verify it actually works

**The SEO check that matters** — the rows must be in the *server* HTML, not
just visible in the browser:

```bash
curl -s -A "Mozilla/5.0" https://ikargos.com/intelligence/china-india-freight-rates \
  | grep -c "Nhava Sheva"
```

Must be **greater than 0**. If it returns 0, the fetch has ended up client-side
and the page will rank for none of this. That is the single most common way to
get this wrong.

Also confirm:

- The iframe renders (framing is allowed for `https://ikargos.com` and
  `https://www.ikargos.com` only — a different origin will be refused).
- Google Rich Results Test accepts the `Dataset` JSON-LD.
- The page is in `sitemap.xml`, then request indexing in Search Console.

---

## 4. If the iframe is blank

The tracker allows framing only from the two origins above. If you serve the
page from another hostname (a staging domain, or a bare IP), the browser will
block it and log a `frame-ancestors` violation in the console. Send us the
origin and we add it — it is one line in `next.config.mjs` on our side, no work
on yours.

## Contact for changes

Anything about the numbers, the columns, the disclaimer wording or the chart is
a tracker-side change. Ask, and it appears on your page within 15 minutes of
our deploy with no edit here.
