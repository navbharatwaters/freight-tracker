import { NextResponse } from "next/server";
import { parseEmlBytes, parsePasted, insertParsed, type InsertResult } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file — plenty for a rate mail

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.startsWith("application/json")) {
      const body = (await req.json()) as {
        body?: string; date?: string; sender?: string; subject?: string;
      };
      if (!body.body || !body.date) {
        return NextResponse.json({ error: "body and date are required" }, { status: 400 });
      }
      const parsed = await parsePasted(body.body, body.date, body.sender, body.subject);
      const result = await insertParsed(parsed);
      return NextResponse.json({ ok: true, results: [result] });
    }

    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) {
        return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
      }

      const results: (InsertResult & { filename: string })[] = [];
      const errors: { filename: string; error: string }[] = [];

      for (const f of files) {
        if (f.size > MAX_BYTES) {
          errors.push({ filename: f.name, error: `file exceeds ${MAX_BYTES} bytes` });
          continue;
        }
        try {
          const bytes = Buffer.from(await f.arrayBuffer());
          const parsed = await parseEmlBytes(bytes, f.name);
          const res = await insertParsed(parsed);
          results.push({ filename: f.name, ...res });
        } catch (e) {
          errors.push({ filename: f.name, error: e instanceof Error ? e.message : String(e) });
        }
      }

      return NextResponse.json({ ok: errors.length === 0, results, errors });
    }

    return NextResponse.json({ error: "unsupported content-type" }, { status: 415 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
