import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Health must reflect the live database, never a build-time snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [health] = await query<{
      last_quote_date: string | null;
      days_since_last: number | null;
      rows_last_30d: number;
      failed_mails_30d: number;
    }>(
      // Format the date in Postgres. node-pg hands a DATE back as a JS Date,
      // which JSON renders as a UTC timestamp -- "2026-07-21T22:00:00.000Z"
      // for what is actually 2026-07-22, a day early for anyone east of UTC.
      `SELECT
         to_char(last_quote_date, 'YYYY-MM-DD') AS last_quote_date,
         days_since_last,
         rows_last_30d,
         failed_mails_30d
       FROM freight_pipeline_health`
    );
    return NextResponse.json({ status: "ok", ...health });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
