import { NextResponse } from "next/server";
import {
  addMarkupRule,
  currentMarkup,
  deleteNewestMarkupRule,
  listMarkupRules,
  previewImpact,
  MARKUP_MIN,
  MARKUP_MAX,
} from "@/lib/markup";
import { describeError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sits under /api/admin/*, which Caddy fronts with basic auth. The username
// from that header is the only identity we have, so it goes into set_by.
function actor(req: Request): string {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("basic ")) {
    try {
      const user = Buffer.from(h.slice(6), "base64").toString("utf8").split(":")[0];
      if (user) return user;
    } catch {
      /* fall through */
    }
  }
  return "admin";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const preview = url.searchParams.get("preview");
    if (preview) {
      return NextResponse.json({ effective_from: preview, points: await previewImpact(preview) });
    }
    const [rules, current] = await Promise.all([listMarkupRules(), currentMarkup()]);
    return NextResponse.json({ rules, current, bounds: { min: MARKUP_MIN, max: MARKUP_MAX } });
  } catch (e) {
    return NextResponse.json({ error: describeError(e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      amount_usd?: number;
      effective_from?: string;
      note?: string;
    };
    if (body.amount_usd == null || !body.effective_from) {
      return NextResponse.json({ error: "amount_usd and effective_from are required" }, { status: 400 });
    }
    const rule = await addMarkupRule({
      amount_usd: body.amount_usd,
      effective_from: body.effective_from,
      note: body.note,
      set_by: actor(req),
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const msg = describeError(e);
    const bad = /must be|required|YYYY-MM-DD/.test(msg);
    return NextResponse.json({ error: msg }, { status: bad ? 400 : 503 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { id?: number };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await deleteNewestMarkupRule(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = describeError(e);
    const bad = /only the newest|seed rule/.test(msg);
    return NextResponse.json({ error: msg }, { status: bad ? 400 : 503 });
  }
}
