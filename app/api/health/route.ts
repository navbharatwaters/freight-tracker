import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  try {
    const [health] = await query<{
      last_quote_date: string | null;
      days_since_last: number | null;
      rows_last_30d: number;
      failed_mails_30d: number;
    }>(`SELECT * FROM freight_pipeline_health`);
    return NextResponse.json({ status: "ok", ...health });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
