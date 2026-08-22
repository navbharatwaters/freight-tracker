/**
 * Rate-mail parser, TypeScript.
 *
 * This is a LITERAL PORT of parser/n8n_parse.js -- same regexes, same
 * branches, same whitelist, same sanity gates. It is not a reimplementation
 * and must not be "cleaned up": every branch here handles a case found in
 * production mail, and those cases live in the fixture, not in intuition.
 * See CLAUDE.md. Change this, change parser/extract.py and
 * parser/n8n_parse.js, then re-run tests/test_parser.py and
 * tests/xcheck_parsers.mjs.
 *
 * It exists so the admin ingest route does not have to shell out to Python.
 * The old route spawned `python3 parser/ingest_eml.py`, which needs a Python
 * interpreter, BeautifulSoup, and the parser/ directory all present next to
 * the built app on the deploy host. Python stays the offline batch path.
 */

// --- Known ports. An unrecognised header STOPS collection rather than
// --- inventing a lane. "Good day to you" matches /X TO Y/ -- this is why.
const ORIGINS = new Set([
  "SHENZHEN", "SHEKOU", "NANSHA", "NINGBO", "SHANGHAI", "QINGDAO",
  "TIANJIN", "XIAMEN", "DALIAN", "GUANGZHOU", "FUZHOU", "YANTIAN",
]);

// Agent writes CCU for Kolkata. Normalise on the way in.
const DEST_ALIAS: Record<string, string> = {
  CCU: "KOLKATA",
  KOLKATA: "KOLKATA",
  "NHAVA SHEVA": "NHAVA SHEVA",
  CHENNAI: "CHENNAI",
  MUNDRA: "MUNDRA",
};

const RATE_RE = /USD\s*(\d{3,5})\s*\/\s*(\d{3,5}|40HQ|40GP|20GP)/i;
const PORT_RE = /^([A-Z][A-Z\s.&-]*?)\s+TO\s+([A-Z][A-Z\s.&-]*?)\s*$/i;

// Forward markers. A forwarded mail's headers carry the FORWARD date and the
// forwarder's address; the agent's real send date and rep are in the quoted
// block. Mirrors SENT_RE / FROM_RE in extract.py.
const SENT_RE = /Sent:?\s*\n?\s*(\d{1,2}\s+\w+\s+\d{4})/i;
const FROM_RE = /From:?\s*\n?\s*([^<\n]+)<([^>]+)>/i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export type ParsedRow = {
  quote_date: string | null;
  origin_port: string;
  dest_port: string;
  rate_20: number | null;
  rate_40: number | null;
  raw_line: string;
  sender: string | null;
  source: string;
};

/** "17 July 2026" -> "2026-07-17". Null if the body has no Sent: block. */
export function bodyDate(text: string): string | null {
  const m = SENT_RE.exec(text);
  if (!m) return null;
  const [dd, mon, yyyy] = m[1].trim().split(/\s+/);
  const mi = MONTHS[String(mon).slice(0, 3).toLowerCase()];
  if (mi === undefined) return null;
  const d = new Date(Date.UTC(Number(yyyy), mi, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function bodySender(text: string): string | null {
  const m = FROM_RE.exec(text);
  return m ? m[2].trim().toLowerCase() : null;
}

/**
 * HTML -> text. Kills tags, decodes the entities that actually appear, and
 * normalises NBSP (the agent's HTML has "NHAVA&nbsp;SHEVA" -- left alone this
 * splits one lane into two).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, "\n")
    // Every remaining tag becomes a line break, NOT a space. BeautifulSoup's
    // get_text('\n') -- what extract.py uses -- puts the separator between
    // every text node, so each cell lands on its own line. Collapsing tags to
    // a space instead merges a lane's rate block into one long line and the
    // 120-char guard then silently drops it: 17 rows across the forwarded
    // mails, all ICD lines like "CMA via pip/mun USD3314/40HQ ETD 11-JULY".
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** The rate-line matcher. Literal port -- see the file header before editing. */
export function parseBody(
  text: string,
  quoteDate: string | null,
  sender: string | null
): ParsedRow[] {
  const out: ParsedRow[] = [];
  let port: { o: string; d: string } | null = null;

  for (const raw of text.split("\n")) {
    // Collapse whitespace, NBSP included, before anything else. raw_line is
    // part of the dedupe key -- if the parsers disagree here the same quote
    // stores twice.
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length > 120) continue;

    // Lane header?
    const p = line.match(PORT_RE);
    if (p && !RATE_RE.test(line)) {
      const o = p[1].trim().toUpperCase();
      const d = p[2].trim().toUpperCase();
      port = ORIGINS.has(o) && DEST_ALIAS[d] ? { o, d: DEST_ALIAS[d] } : null;
      continue;
    }

    // Rate line?
    const m = line.match(RATE_RE);
    if (!m || !port) continue;

    const a = parseInt(m[1], 10);
    const b = m[2];
    let rate20: number | null = null;
    let rate40: number | null = null;

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
    const ok = (v: number | null) => v === null || (v >= 100 && v <= 20000);
    if (!ok(rate20) || !ok(rate40)) continue;
    // 20ft and 40ft track each other on a lane; a huge spread is a typo.
    if (rate20 !== null && rate40 !== null &&
        (rate20 > rate40 * 2 || rate40 > rate20 * 3)) continue;

    out.push({
      quote_date: quoteDate,
      origin_port: port.o,
      dest_port: port.d,
      rate_20: rate20,
      rate_40: rate40,
      raw_line: line.slice(0, 200),
      sender,
      source: "ocean_star",
    });
  }
  return out;
}

// ============================================================
// Minimal MIME reader
//
// Only what this one agent's mail actually uses, measured across all 86
// archived .eml files: nested multipart/mixed > related > alternative,
// base64 and quoted-printable bodies, gb2312 and utf-8 charsets.
// Deliberately not a general MIME library -- a dependency that could parse
// everything also drags in a vulnerable transitive tree, and this path is
// cross-checked against extract.py over the whole corpus.
// ============================================================

type MimePart = {
  headers: Record<string, string>;
  contentType: string;
  charset: string;
  encoding: string;
  body: Buffer;
  children: MimePart[];
};

function splitHeaders(buf: Buffer): { headers: Record<string, string>; rest: Buffer } {
  // Header/body separator is a blank line; tolerate CRLF and bare LF.
  let idx = buf.indexOf("\r\n\r\n");
  let sepLen = 4;
  const lfIdx = buf.indexOf("\n\n");
  if (idx === -1 || (lfIdx !== -1 && lfIdx < idx)) {
    idx = lfIdx;
    sepLen = 2;
  }
  const headBuf = idx === -1 ? buf : buf.subarray(0, idx);
  const rest = idx === -1 ? Buffer.alloc(0) : buf.subarray(idx + sepLen);

  // Unfold continuation lines (leading whitespace continues the previous one).
  const lines = headBuf.toString("latin1").split(/\r?\n/);
  const unfolded: string[] = [];
  for (const ln of lines) {
    if (/^[ \t]/.test(ln) && unfolded.length) unfolded[unfolded.length - 1] += " " + ln.trim();
    else unfolded.push(ln);
  }

  const headers: Record<string, string> = {};
  for (const ln of unfolded) {
    const c = ln.indexOf(":");
    if (c === -1) continue;
    const k = ln.slice(0, c).trim().toLowerCase();
    const v = ln.slice(c + 1).trim();
    // First occurrence wins, matching Python's email package.
    if (!(k in headers)) headers[k] = v;
  }
  return { headers, rest };
}

function param(value: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"?([^";\\s]+)"?`, "i");
  const m = re.exec(value);
  return m ? m[1] : null;
}

function decodeBody(body: Buffer, encoding: string): Buffer {
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    return Buffer.from(body.toString("latin1").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  }
  if (enc === "quoted-printable") {
    const s = body
      .toString("latin1")
      .replace(/=\r?\n/g, "")           // soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(s, "latin1");
  }
  return body;
}

function decodeText(buf: Buffer, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/^3d/, ""); // charset=3Dgb2312
  try {
    return new TextDecoder(cs).decode(buf);
  } catch {
    // Node without full ICU, or an unheard-of charset. utf-8 is the least
    // bad guess; a mangled body shows up as zero parsed rows, not silence.
    return buf.toString("utf8");
  }
}

function parsePart(buf: Buffer): MimePart {
  const { headers, rest } = splitHeaders(buf);
  const ctRaw = headers["content-type"] || "text/plain";
  const contentType = ctRaw.split(";")[0].trim().toLowerCase();
  const charset = (param(ctRaw, "charset") || "utf-8").replace(/^3D/i, "");
  const encoding = headers["content-transfer-encoding"] || "7bit";

  const part: MimePart = {
    headers, contentType, charset, encoding,
    body: Buffer.alloc(0), children: [],
  };

  if (contentType.startsWith("multipart/")) {
    const boundary = param(ctRaw, "boundary");
    if (boundary) {
      const marker = `--${boundary}`;
      const text = rest.toString("latin1");
      const chunks: string[] = [];
      let pos = text.indexOf(marker);
      while (pos !== -1) {
        const start = text.indexOf("\n", pos);
        if (start === -1) break;
        const next = text.indexOf(marker, start);
        chunks.push(text.slice(start + 1, next === -1 ? undefined : next));
        if (next === -1 || text.slice(next, next + marker.length + 2) === `${marker}--`) break;
        pos = next;
      }
      for (const c of chunks) part.children.push(parsePart(Buffer.from(c, "latin1")));
    }
    return part;
  }

  part.body = decodeBody(rest, encoding);
  return part;
}

/** Depth-first search for the first part of the given content type. */
function findPart(part: MimePart, type: string): MimePart | null {
  if (part.contentType === type) return part;
  for (const c of part.children) {
    const hit = findPart(c, type);
    if (hit) return hit;
  }
  return null;
}

export type EmlMeta = {
  text: string;
  subject: string;
  messageId: string | null;
  headerSender: string | null;
  headerDate: string | null;
  sentAt: string | null;
};

/** Decode an .eml into the text body plus the headers the ingest route needs. */
export function readEml(bytes: Buffer): EmlMeta {
  const root = parsePart(bytes);

  // Prefer HTML, same order as extract.py's get_body(preferencelist=('html','plain')).
  const html = findPart(root, "text/html");
  const plain = findPart(root, "text/plain");
  let text = "";
  if (html) text = htmlToText(decodeText(html.body, html.charset));
  else if (plain) text = decodeText(plain.body, plain.charset);

  const h = root.headers;
  const subject = decodeMimeWords(h["subject"] || "").trim();
  const messageId = (h["message-id"] || "").trim() || null;

  const fromHdr = h["from"] || "";
  const angle = /<([^>]+)>/.exec(fromHdr);
  const headerSender = (angle ? angle[1] : fromHdr).trim().toLowerCase() || null;

  let headerDate: string | null = null;
  let sentAt: string | null = null;
  if (h["date"]) {
    const d = new Date(h["date"]);
    if (!Number.isNaN(d.getTime())) {
      headerDate = d.toISOString().slice(0, 10);
      sentAt = d.toISOString();
    }
  }

  return { text, subject, messageId, headerSender, headerDate, sentAt };
}

/** RFC 2047 encoded-word decoding, for Subject lines like =?gb2312?B?...?= */
function decodeMimeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    try {
      const buf =
        enc.toUpperCase() === "B"
          ? Buffer.from(data, "base64")
          : Buffer.from(
              String(data).replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) =>
                String.fromCharCode(parseInt(h, 16))
              ),
              "latin1"
            );
      return decodeText(buf, cs);
    } catch {
      return data;
    }
  });
}

export type MailParseResult = {
  message_id: string | null;
  sent_at: string | null;
  subject: string;
  sender: string | null;
  source: string;
  quote_date: string | null;
  rows: ParsedRow[];
  warnings: string[];
};

/** Parse an uploaded .eml. */
export function parseEml(bytes: Buffer, filename = "upload.eml"): MailParseResult {
  const warnings: string[] = [];
  const meta = readEml(bytes);

  // Forward -> body carries the original send date and rep. Direct mail from
  // the agent has no "Sent:" block, so the headers ARE the original.
  const quoteDate = bodyDate(meta.text) || meta.headerDate;
  const sender = bodySender(meta.text) || meta.headerSender;

  if (!quoteDate) warnings.push("could not determine quote_date from mail; rows dropped");

  const rows = quoteDate ? parseBody(meta.text, quoteDate, sender) : [];
  if (quoteDate && !rows.length) warnings.push("no rate lines matched");
  if (!meta.text.trim()) warnings.push(`no readable text body in ${filename}`);

  return {
    message_id: meta.messageId,
    sent_at: meta.sentAt,
    subject: meta.subject,
    sender,
    source: "ocean_star",
    quote_date: quoteDate,
    rows,
    warnings,
  };
}

/** Parse a pasted mail body. Date comes from the form, not the text. */
export function parsePastedBody(
  body: string,
  date: string,
  sender?: string,
  subject?: string
): MailParseResult {
  const warnings: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");

  const s = (sender || "").toLowerCase() || null;
  const rows = parseBody(body, date, s);
  if (!rows.length) warnings.push("no rate lines matched");

  return {
    message_id: null,
    sent_at: null,
    subject: subject || "pasted body",
    sender: s,
    source: "ocean_star",
    quote_date: date,
    rows,
    warnings,
  };
}
