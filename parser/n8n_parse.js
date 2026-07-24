// ============================================================
// n8n Code node — "Parse Ocean Star rate mail"
// Mode: Run Once for All Items
// Input : Gmail Trigger items (needs html or text, headers, id)
// Output: one item per carrier quote line, ready for Postgres insert
// ============================================================

// --- Known ports. An unrecognised header STOPS collection rather than
// --- inventing a lane. "Good day to you" matches /X TO Y/ — this is why.
const ORIGINS = new Set([
  'SHENZHEN', 'SHEKOU', 'NANSHA', 'NINGBO', 'SHANGHAI', 'QINGDAO',
  'TIANJIN', 'XIAMEN', 'DALIAN', 'GUANGZHOU', 'FUZHOU', 'YANTIAN',
]);

// Agent writes CCU for Kolkata. Normalise on the way in.
const DEST_ALIAS = {
  'CCU': 'KOLKATA',
  'KOLKATA': 'KOLKATA',
  'NHAVA SHEVA': 'NHAVA SHEVA',
  'CHENNAI': 'CHENNAI',
  'MUNDRA': 'MUNDRA',
};

const RATE_RE = /USD\s*(\d{3,5})\s*\/\s*(\d{3,5}|40HQ|40GP|20GP)/i;
const PORT_RE = /^([A-Z][A-Z\s.&-]*?)\s+TO\s+([A-Z][A-Z\s.&-]*?)\s*$/i;

// HTML -> text. Kills tags, decodes the entities that actually appear,
// and normalises NBSP (agent's HTML has "NHAVA\u00a0SHEVA" — this splits
// your data in two if left alone).
function htmlToText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseBody(text) {
  const out = [];
  let port = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 120) continue;

    // Lane header?
    const p = line.match(PORT_RE);
    if (p && !RATE_RE.test(line)) {
      const o = p[1].trim().toUpperCase();
      const d = p[2].trim().toUpperCase();
      port = (ORIGINS.has(o) && DEST_ALIAS[d]) ? { o, d: DEST_ALIAS[d] } : null;
      continue;
    }

    // Rate line?
    const m = line.match(RATE_RE);
    if (!m || !port) continue;

    const a = parseInt(m[1], 10);
    const b = m[2];
    let rate20 = null, rate40 = null;

    if (/^40(HQ|GP)$/i.test(b)) {
      rate40 = a;                    // USD1500/40HQ  -> 40ft only
    } else if (/^20GP$/i.test(b)) {
      rate20 = a;                    // USD1600/20GP  -> 20ft only
    } else {
      rate20 = a;                    // USD1525/1575  -> both
      rate40 = parseInt(b, 10);
    }

    // Sanity gate. Agent typos are real: "MSC USD21950/1950" in the 8 Jul
    // mail is a fat-fingered 1950/1950, and unfiltered it drags that lane's
    // mean up by ~$1,400.
    const ok = (v) => v === null || (v >= 100 && v <= 20000);
    if (!ok(rate20) || !ok(rate40)) continue;
    // 20ft and 40ft track each other on a lane; a huge spread is a typo.
    if (rate20 !== null && rate40 !== null &&
        (rate20 > rate40 * 2 || rate40 > rate20 * 3)) continue;

    out.push({
      origin_port: port.o,
      dest_port: port.d,
      rate_20: rate20,
      rate_40: rate40,
      raw_line: line.slice(0, 200),
    });
  }
  return out;
}

// --- main -----------------------------------------------------
const results = [];

for (const item of $input.all()) {
  const j = item.json;

  const html = j.html || j.textAsHtml || '';
  const text = html ? htmlToText(html) : (j.text || j.textPlain || '');

  // quote_date = when the AGENT sent it. Gmail Trigger's date is the
  // received date, which is the same thing for a direct mail — but if you
  // ever ingest forwards, prefer the header over anything in the body.
  const sentAt = j.date || j.internalDate || new Date().toISOString();
  const quoteDate = new Date(sentAt).toISOString().slice(0, 10);

  const from = (j.from?.value?.[0]?.address || j.from?.text || j.From || '')
    .toLowerCase().replace(/.*<|>.*/g, '');

  const messageId = j.messageId || j.id || `${from}:${sentAt}`;
  const subject = j.subject || '';

  const rows = parseBody(text);

  for (const r of rows) {
    results.push({
      json: {
        ...r,
        quote_date: quoteDate,
        source: 'ocean_star',
        sender: from,
        message_id: messageId,
      },
    });
  }

  // Always emit a log row — a mail that parsed to zero is a signal,
  // not a silence. Route these to freight_mail_log.
  results.push({
    json: {
      __log: true,
      message_id: messageId,
      sent_at: new Date(sentAt).toISOString(),
      subject,
      sender: from,
      source: 'ocean_star',
      rows_parsed: rows.length,
      parse_status: rows.length > 0 ? 'ok' : 'zero_rows',
    },
  });
}

return results;
