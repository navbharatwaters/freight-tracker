"use client";
import { useCallback, useEffect, useState } from "react";
import MarkupCard from "./MarkupCard";

type LeadRow = {
  id: number;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  origin_port: string | null;
  dest_port: string | null;
  notified: boolean;
};

type MailRow = {
  message_id: string;
  sent_at: string;
  subject: string | null;
  sender: string | null;
  source: string;
  rows_parsed: number;
  parse_status: string;
  processed_at: string;
};

type Health = {
  last_quote_date: string | null;
  days_since_last: number | null;
  rows_last_30d: string;
  failed_mails_30d: string;
};

type IngestResult = {
  filename?: string;
  message_id: string | null;
  subject: string;
  sender: string | null;
  quote_date: string | null;
  parsed: number;
  inserted: number;
  skipped: number;
  warnings: string[];
  destinations: string[];
  origins: string[];
};

type IngestError = { filename: string; error: string };

export default function AdminClient() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<IngestResult[]>([]);
  const [errors, setErrors] = useState<IngestError[]>([]);
  const [mails, setMails] = useState<MailRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [pasteBody, setPasteBody] = useState("");
  const [pasteDate, setPasteDate] = useState(new Date().toISOString().slice(0, 10));
  const [pasteSender, setPasteSender] = useState("");

  const [connError, setConnError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/recent", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setMails(j.mails ?? []);
      setLeads(j.leads ?? []);
      setHealth(j.health ?? null);
      // A dead database used to fail silently here, leaving a blank page and
      // no reason. Say so instead.
      setConnError(r.ok ? null : j.error || `recent failed: HTTP ${r.status}`);
    } catch (e) {
      setConnError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".eml"));
    if (!arr.length) {
      setErrors([{ filename: "-", error: "no .eml files selected" }]);
      return;
    }
    setBusy(true);
    setResults([]);
    setErrors([]);
    try {
      const fd = new FormData();
      arr.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/admin/ingest", { method: "POST", body: fd });
      const j = await res.json();
      setResults(j.results ?? []);
      setErrors(j.errors ?? []);
      await refresh();
    } catch (e) {
      setErrors([{ filename: "-", error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const submitPaste = async () => {
    if (!pasteBody.trim() || !pasteDate) return;
    setBusy(true);
    setResults([]);
    setErrors([]);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: pasteBody,
          date: pasteDate,
          sender: pasteSender || undefined,
          subject: "pasted body",
        }),
      });
      const j = await res.json();
      setResults(j.results ?? []);
      setErrors(j.errors ?? []);
      if (res.ok) setPasteBody("");
      await refresh();
    } catch (e) {
      setErrors([{ filename: "paste", error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 p-5 md:p-10">
      <div className="max-w-4xl mx-auto space-y-7">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-[11px] tracking-[0.22em] uppercase text-slate-500">iKargos · admin</p>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2 tracking-tight">Ingest rate mails</h1>
          <p className="text-sm text-slate-600 mt-2">
            Drop rate emails as .eml (Outlook: drag from the message list · Gmail: open the mail,
            three-dot menu → Download message) or paste the mail body. Several files at once is
            fine.
          </p>
          <p className="text-sm text-slate-600 mt-1">
            Re-uploading the same mail is safe — a quote is matched on its date, lane, source,
            sender and the original text of the line, so a repeat inserts nothing. Forwarded mail
            works too: the real send date is read from the forwarded body, not the forward header.
          </p>
        </header>

        {connError && (
          <div className="text-sm border border-rose-200 rounded p-3 bg-rose-50">
            <p className="font-medium text-rose-800">Database unreachable</p>
            <p className="text-xs text-rose-700 mt-1 break-words">{connError}</p>
            <p className="text-xs text-rose-700 mt-1">
              Ingest will fail until this is fixed. Check <code>DATABASE_URL</code> on the server.
            </p>
          </div>
        )}

        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Last quote" value={health.last_quote_date ?? "—"} />
            <Stat label="Days since" value={String(health.days_since_last ?? "—")} />
            <Stat label="Rows 30d" value={String(health.rows_last_30d)} />
            <Stat label="Failed mails 30d" value={String(health.failed_mails_30d)} />
          </div>
        )}

        <MarkupCard />

        <section
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void uploadFiles(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
            dragOver ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50"
          }`}
        >
          <p className="text-sm text-slate-600">
            Drag .eml files here, or{" "}
            <label className="text-teal-700 underline cursor-pointer">
              browse
              <input
                type="file"
                accept=".eml"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
            </label>
          </p>
          {busy && <p className="text-xs text-slate-500 mt-2">Parsing and inserting…</p>}
        </section>

        <section className="border border-slate-200 rounded-lg p-4 md:p-5">
          <h2 className="text-sm font-semibold mb-2">Or paste mail body</h2>
          <div className="flex flex-wrap gap-3 mb-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                Quote date
              </label>
              <input
                type="date"
                value={pasteDate}
                onChange={(e) => setPasteDate(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                Sender (optional)
              </label>
              <input
                type="text"
                placeholder="as01@oceanstarsz.com"
                value={pasteSender}
                onChange={(e) => setPasteSender(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            value={pasteBody}
            onChange={(e) => setPasteBody(e.target.value)}
            rows={10}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            placeholder={"SHENZHEN TO NHAVA SHEVA\nEMC USD1525/1575 CLS22-Jul\n..."}
          />
          <button
            onClick={submitPaste}
            disabled={busy || !pasteBody.trim()}
            className="mt-3 bg-teal-700 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            Parse & insert
          </button>
        </section>

        {(results.length > 0 || errors.length > 0) && (
          <section className="border border-slate-200 rounded-lg p-4 md:p-5 space-y-2">
            <h2 className="text-sm font-semibold">Last run</h2>
            {results.map((r, i) => (
              <div key={i} className="text-sm border border-slate-200 rounded p-3 bg-slate-50">
                <p className="font-medium">
                  {r.filename ?? "paste"} — {r.quote_date ?? "(no date)"} · {r.sender ?? "unknown sender"}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  parsed <strong>{r.parsed}</strong> · inserted <strong>{r.inserted}</strong> · skipped{" "}
                  <strong>{r.skipped}</strong>
                  {r.destinations.length ? ` · dests: ${r.destinations.join(", ")}` : ""}
                  {r.origins.length ? ` · origins: ${r.origins.join(", ")}` : ""}
                </p>
                {r.warnings.length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">warnings: {r.warnings.join("; ")}</p>
                )}
              </div>
            ))}
            {errors.map((e, i) => (
              <div key={i} className="text-sm border border-rose-200 rounded p-3 bg-rose-50">
                <p className="font-medium text-rose-800">{e.filename} — failed</p>
                <p className="text-xs text-rose-700 mt-1">{e.error}</p>
              </div>
            ))}
          </section>
        )}

        <section className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-semibold">Leads from the tracker</h2>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-white sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Received</th>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Contact</th>
                  <th className="text-left px-4 py-2 font-medium">Lane</th>
                  <th className="text-left px-4 py-2 font-medium">Notified</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                      {new Date(l.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {l.name}
                      {l.company ? ` · ${l.company}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {l.email}
                      {l.phone ? ` · ${l.phone}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {l.origin_port && l.dest_port ? `${l.origin_port} → ${l.dest_port}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">{l.notified ? "yes" : "no"}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No leads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-semibold">Recent mails ingested</h2>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-white sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Processed</th>
                  <th className="text-left px-4 py-2 font-medium">Sender</th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-right px-4 py-2 font-medium">Rows</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mails.map((m) => (
                  <tr key={m.message_id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                      {new Date(m.processed_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-xs">{m.sender ?? "—"}</td>
                    <td className="px-4 py-2 text-xs truncate max-w-[280px]">{m.subject ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.rows_parsed}</td>
                    <td className="px-4 py-2 text-xs">{m.parse_status}</td>
                  </tr>
                ))}
                {mails.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No mails ingested yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-lg font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}
