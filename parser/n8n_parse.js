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

// Forward markers. A forwarded mail's headers carry the FORWARD date and the
// forwarder's address; the agent's real send date and rep are in the quoted
// block. Mirrors SENT_RE / FROM_RE in extract.py -- keep the two in step.
const SENT_RE = /Sent:?\s*\n?\s*(\d{1,2}\s+\w+\s+\d{4})/i;
const FROM_RE = /From:?\s*\n?\s*([^<\n]+)<([^>]+)>/i;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "17 July 2026" -> "2026-07-17". Null if the body has no Sent: block. */
function bodyDate(text) {
  const m = SENT_RE.exec(text);
  if (!m) return null;
  const [dd, mon, yyyy] = m[1].trim().split(/\s+/);
  const mi = MONTHS[String(mon).slice(0, 3).toLowerCase()];
  if (mi === undefined) return null;
  const d = new Date(Date.UTC(Number(yyyy), mi, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function bodySender(text) {
  const m = FROM_RE.exec(text);
  return m ? m[2].trim().toLowerCase() : null;
}

// HTML -> text. Kills tags, decodes the entities that actually appear,
// and normalises NBSP (agent's HTML has "NHAVA\u00a0SHEVA" — this splits
// your data in two if left alone).
function htmlToText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, '\n')
    // Every remaining tag becomes a line break, NOT a space. BeautifulSoup's
    // get_text('\n') -- what extract.py uses -- separates every text node, so
    // each cell lands on its own line. A space instead merges a lane's rate
    // block into one long line and the 120-char guard silently drops it:
    // 17 rows across the forwarded mails, all ICD lines like
    // "CMA via pip/mun USD3314/40HQ ETD 11-JULY".
    .replace(/<[^>]+>/g, '\n')
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

  // quote_date = when the AGENT sent it, never when it was forwarded on.
  // Direct mail has no "Sent:" block, so the header IS the original; a
  // forward's header is the forward date and must lose to the body.
  const sentAt = j.date || j.internalDate || new Date().toISOString();
  const headerDate = new Date(sentAt).toISOString().slice(0, 10);
  const quoteDate = bodyDate(text) || headerDate;

  const headerFrom = (j.from?.value?.[0]?.address || j.from?.text || j.From || '')
    .toLowerCase().replace(/.*<|>.*/g, '');
  const from = bodySender(text) || headerFrom;

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
