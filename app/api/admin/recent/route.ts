import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  const [health] = await query<{
    last_quote_date: string | null;
    days_since_last: number | null;
    rows_last_30d: string;
    failed_mails_30d: string;
  }>(`SELECT * FROM freight_pipeline_health`);

  return NextResponse.json({ mails, health });
}
