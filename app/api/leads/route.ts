import { NextResponse } from "next/server";
import { insertLead, notifyLead, type LeadInput } from "@/lib/leads";
import { describeError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Partial<LeadInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const source = body.source === "tracker_embed" ? "tracker_embed" : "tracker_web";

  try {
    const { id } = await insertLead({ ...body, source } as LeadInput);
    // Fire-and-forget: the lead is already durably stored, a slow or failed
    // mail server must not delay or fail the visitor's submission.
    void notifyLead(id, { ...body, source } as LeadInput);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: describeError(e) }, { status: 400 });
  }
}
