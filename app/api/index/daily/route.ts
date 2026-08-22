import { NextResponse } from "next/server";
import { getIndexRows } from "@/lib/index-data";

export const revalidate = 900;

export async function GET() {
  const { rows, source, error } = await getIndexRows();

  if (error) {
    return NextResponse.json({ error }, { status: 503 });
  }

  return NextResponse.json(
    { rows, source, updated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=900" } }
  );
}
