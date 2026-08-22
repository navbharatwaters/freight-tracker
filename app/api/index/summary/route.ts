import { NextResponse } from "next/server";
import { getIndexSummary } from "@/lib/index-data";
import { describeError } from "@/lib/errors";

export const revalidate = 900;

/**
 * Public, presentation-ready summary for partner sites (iKargos).
 *
 * Read-only and anonymous by design: it exposes the same averaged figures the
 * public chart already shows, nothing more. No raw quotes, no sender
 * addresses, no message ids, no mail log.
 *
 * The response carries its own columns, heading and note so the partner page
 * never hard-codes a schema -- see the comment on getIndexSummary().
 *
 * CORS is open because the payload is public data and a partner may want to
 * fetch it browser-side. Server-side fetch (the recommended path, since it is
 * what makes the table crawlable) does not need this header at all.
 */
export async function GET() {
  try {
    const summary = await getIndexSummary();
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: describeError(e) }, { status: 503 });
  }
}
