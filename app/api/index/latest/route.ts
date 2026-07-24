import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 900;

type Row = {
  quote_date: string;
  origin_port: string;
  dest_port: string;
  rate_20: number | null;
  rate_40: number | null;
  n_20: number;
  n_40: number;
};

export async function GET() {
  const rows = await query<Row>(`
    SELECT
      to_char(quote_date, 'YYYY-MM-DD') AS quote_date,
      origin_port, dest_port,
      rate_20, rate_40, n_20, n_40
    FROM freight_index_latest
    ORDER BY dest_port, origin_port
  `);

  return NextResponse.json(
    { rows, updated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=900" } }
  );
}
