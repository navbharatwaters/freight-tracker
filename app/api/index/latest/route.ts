import { NextResponse } from "next/server";
import { getIndexRows } from "@/lib/index-data";

export const revalidate = 900;

export async function GET() {
  const { rows, source, error } = await getIndexRows();

  if (error) {
    return NextResponse.json({ error }, { status: 503 });
  }

  // Latest observation per lane. Rows arrive ordered by quote_date ascending,
  // so the last write per lane wins.
  const byLane = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byLane.set(`${r.origin}|${r.dest}`, r);

  const latest = [...byLane.values()].sort(
    (a, b) => a.dest.localeCompare(b.dest) || a.origin.localeCompare(b.origin)
  );

  return NextResponse.json(
    { rows: latest, source, updated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=900" } }
  );
}
