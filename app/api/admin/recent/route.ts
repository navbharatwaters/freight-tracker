import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { describeError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
  const mails = await query<{
    message_id: string;
    sent_at: string;
    subject: string | null;
    sender: string | null;
    source: string;
    rows_parsed: number;
    parse_status: string;
    processed_at: string;
  }>(
    `SELECT message_id, sent_at, subject, sender, source, rows_parsed, parse_status, processed_at
     FROM freight_mail_log
     ORDER BY processed_at DESC
     LIMIT 25`
  );

  const leads = await query<{
    id: number;
    created_at: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    origin_port: string | null;
    dest_port: string | null;
    notified: boolean;
  }>(
    `SELECT id, created_at, name, email, phone, company, origin_port, dest_port, notified
     FROM leads
     ORDER BY created_at DESC
     LIMIT 25`
  );

  const [health] = await query<{
    last_quote_date: string | null;
    days_since_last: number | null;
    rows_last_30d: string;
    failed_mails_30d: string;
  }>(
    // to_char, not SELECT * -- node-pg hands a DATE back as a JS Date, which
    // JSON.stringify renders as a full UTC timestamp. That both overflowed the
    // admin stat box and shifted the date a day backwards for anyone east of
    // UTC. Format it in Postgres and it stays a plain calendar date.
    `SELECT
       to_char(last_quote_date, 'YYYY-MM-DD') AS last_quote_date,
       days_since_last,
       rows_last_30d,
       failed_mails_30d
     FROM freight_pipeline_health`
  );

  return NextResponse.json({ mails, leads, health });
  } catch (e) {
    // The admin page must still render when the database is unreachable --
    // otherwise the operator sees an empty screen with no clue why.
    return NextResponse.json(
      { mails: [], leads: [], health: null, error: describeError(e) },
      { status: 503 }
    );
  }
}
