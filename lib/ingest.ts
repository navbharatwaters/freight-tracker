import crypto from "node:crypto";
import { pool } from "./db";
import {
  parseEml,
  parsePastedBody,
  type MailParseResult,
  type ParsedRow,
} from "./parse-mail";

export type { ParsedRow };
export type ParseResult = MailParseResult;

/**
 * Parsing runs IN PROCESS. It used to spawn `python3 parser/ingest_eml.py`,
 * which required a Python interpreter, BeautifulSoup, and the parser/
 * directory to all be present next to the built app on the deploy host --
 * none of which a Next.js production bundle ships. That is why /admin ingest
 * failed in production for both the .eml drop and the paste box.
 *
 * lib/parse-mail.ts is a literal port of the Python matcher and is verified
 * row-for-row against it over all 86 archived mails by
 * tests/xcheck_parsers.mjs. Python remains the offline batch path.
 */
export async function parseEmlBytes(bytes: Buffer, filename = "upload.eml"): Promise<ParseResult> {
  return parseEml(bytes, filename);
}

export async function parsePasted(
  body: string,
  date: string,
  sender?: string,
  subject?: string
): Promise<ParseResult> {
  return parsePastedBody(body, date, sender, subject);
}

export type InsertResult = {
  message_id: string | null;
  subject: string;
  sender: string | null;
  quote_date: string | null;
  parsed: number;
  inserted: number;
  skipped: number;
  warnings: string[];
  destinations: string[];
  origins: string[];
};

export async function insertParsed(parsed: ParseResult): Promise<InsertResult> {
  // Synthesize a message_id when none present (e.g. pasted body) so the mail
  // log, whose PK is message_id, still gets one row per paste. Row dedupe does
  // not depend on this -- it keys on (date, lane, source, sender, raw_line).
  const messageId =
    parsed.message_id ??
    `<paste-${crypto
      .createHash("sha256")
      .update(`${parsed.quote_date}|${parsed.rows.map((r) => r.raw_line).join("\n")}`)
      .digest("hex")
      .slice(0, 32)}@freight-tracker>`;

  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;
  try {
    await client.query("BEGIN");

    for (const r of parsed.rows) {
      if (!r.quote_date) {
        skipped++;
        continue;
      }
      const res = await client.query(
        `INSERT INTO freight_quotes
           (quote_date, origin_port, dest_port, rate_20, rate_40, source, sender, message_id, raw_line)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (quote_date, origin_port, dest_port, source, (COALESCE(sender, '')), raw_line)
           DO NOTHING
         RETURNING id`,
        [
          r.quote_date,
          r.origin_port,
          r.dest_port,
          r.rate_20,
          r.rate_40,
          r.source,
          r.sender,
          messageId,
          r.raw_line,
        ]
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
      else skipped++;
    }

    // Upsert mail log
    await client.query(
      `INSERT INTO freight_mail_log
         (message_id, sent_at, subject, sender, source, rows_parsed, parse_status)
       VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6, $7)
       ON CONFLICT (message_id) DO UPDATE
         SET rows_parsed = EXCLUDED.rows_parsed,
             parse_status = EXCLUDED.parse_status,
             processed_at = now()`,
      [
        messageId,
        parsed.sent_at,
        parsed.subject,
        parsed.sender,
        parsed.source,
        parsed.rows.length,
        parsed.rows.length === 0 ? "zero_rows" : "ok",
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const destinations = Array.from(new Set(parsed.rows.map((r) => r.dest_port))).sort();
  const origins = Array.from(new Set(parsed.rows.map((r) => r.origin_port))).sort();

  return {
    message_id: parsed.message_id,
    subject: parsed.subject,
    sender: parsed.sender,
    quote_date: parsed.quote_date,
    parsed: parsed.rows.length,
    inserted,
    skipped,
    warnings: parsed.warnings,
    destinations,
    origins,
  };
}
