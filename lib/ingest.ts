import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { pool } from "./db";

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

export type ParseResult = {
  message_id: string | null;
  sent_at: string | null;
  subject: string;
  sender: string | null;
  source: string;
  quote_date: string | null;
  rows: ParsedRow[];
  warnings: string[];
};

const PY = process.env.PYTHON_BIN || "python3";
const PARSER = path.join(process.cwd(), "parser", "ingest_eml.py");

async function runPython(args: string[], stdin?: Buffer | string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [PARSER, ...args]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) {
        return reject(new Error(`parser exit ${code}: ${stderr || stdout}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`parser JSON error: ${(e as Error).message} / raw: ${stdout.slice(0, 500)}`));
      }
    });
    if (stdin !== undefined) {
      p.stdin.end(stdin);
    } else {
      p.stdin.end();
    }
  });
}

export async function parseEmlBytes(bytes: Buffer, filename = "upload.eml"): Promise<ParseResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ft-"));
  const tmpPath = path.join(tmpDir, filename.replace(/[^\w.\-]/g, "_"));
  try {
    await fs.writeFile(tmpPath, bytes);
    return await runPython([tmpPath]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function parsePasted(body: string, date: string, sender?: string, subject?: string): Promise<ParseResult> {
  const args = ["--paste", "--date", date];
  if (sender) args.push("--sender", sender);
  if (subject) args.push("--subject", subject);
  return runPython(args, body);
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
  // Synthesize a message_id when none present (e.g. pasted body) so the dedupe
  // unique index (partial: WHERE message_id IS NOT NULL) still catches re-uploads.
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
         ON CONFLICT ON CONSTRAINT uq_freight_quotes_dedupe DO NOTHING
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
