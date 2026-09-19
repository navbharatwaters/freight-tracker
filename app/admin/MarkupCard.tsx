"use client";
import { useCallback, useEffect, useState } from "react";

type Rule = {
  id: number;
  effective_from: string;
  amount_usd: number;
  set_by: string;
  note: string | null;
  created_at: string;
  points: number;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Published-rate markup. Every chart point = raw Ocean Star mean + the rule
 * in force on that point's quote date. Adding a rule dated today moves
 * future points only; a backdated rule rewrites the points from that date
 * on, so the operator sees how many before confirming.
 */
export default function MarkupCard() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [current, setCurrent] = useState<Rule | null>(null);
  const [bounds, setBounds] = useState({ min: 0, max: 1000 });
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState("");
  const [impact, setImpact] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/markup", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRules(j.rules ?? []);
      setCurrent(j.current ?? null);
      if (j.bounds) setBounds(j.bounds);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Backdating: tell the operator how much history moves before they commit.
  useEffect(() => {
    if (!from || from >= today()) {
      setImpact(null);
      return;
    }
    let live = true;
    fetch(`/api/admin/markup?preview=${from}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setImpact(typeof j.points === "number" ? j.points : null))
      .catch(() => live && setImpact(null));
    return () => {
      live = false;
    };
  }, [from]);

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) {
      setMsg({ kind: "err", text: `Enter a whole number between ${bounds.min} and ${bounds.max}.` });
      return;
    }
    if (impact != null && impact > 0) {
      const ok = window.confirm(
        `This date is in the past. ${impact} already-published chart point${impact === 1 ? "" : "s"} ` +
          `will change to +$${n}. Continue?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/markup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_usd: n, effective_from: from, note: note || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: `Markup is +$${n} for quotes dated ${from} onwards. Chart updates on next load.` });
      setAmount("");
      setNote("");
      setFrom(today());
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Rule) => {
    if (!window.confirm(`Delete the +$${r.amount_usd} rule from ${r.effective_from}? Points from that date fall back to the previous rule.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/markup", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const newestId = rules[0]?.id;

  return (
    <section className="border border-slate-200 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold">Published markup</h2>
        {current && (
          <p className="text-sm text-slate-700">
            Currently <strong className="tabular-nums">+${current.amount_usd}</strong> per container
            {current.effective_from !== "1970-01-01" ? ` since ${current.effective_from}` : ""}
          </p>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Every chart figure is Ocean Star&apos;s average plus this amount, 20ft and 40ft alike. A new
        rule applies to quotes dated on or after its start date; earlier points keep the markup that
        was in force then.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">New markup (USD)</label>
          <input
            type="number"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={current ? String(current.amount_usd) : "300"}
            className="w-32 border border-slate-300 rounded-md px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">From quote date</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="BAF revised"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy || amount === ""}
          className="bg-teal-700 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          Apply
        </button>
      </div>

      {impact != null && impact > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          Backdated: {impact} already-published point{impact === 1 ? "" : "s"} will change.
        </p>
      )}
      {msg && (
        <p className={`text-xs mt-2 ${msg.kind === "ok" ? "text-teal-700" : "text-rose-700"}`}>{msg.text}</p>
      )}

      {rules.length > 0 && (
        <table className="w-full text-sm mt-4">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left py-1.5 font-medium">From</th>
              <th className="text-right py-1.5 font-medium">Markup</th>
              <th className="text-right py-1.5 font-medium">Points</th>
              <th className="text-left py-1.5 pl-4 font-medium">Set by</th>
              <th className="text-left py-1.5 pl-4 font-medium">Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5 text-xs whitespace-nowrap">
                  {r.effective_from === "1970-01-01" ? "start" : r.effective_from}
                </td>
                <td className="py-1.5 text-right tabular-nums">+${r.amount_usd}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">{r.points}</td>
                <td className="py-1.5 pl-4 text-xs text-slate-500">
                  {r.set_by} · {new Date(r.created_at).toLocaleDateString("en-GB")}
                </td>
                <td className="py-1.5 pl-4 text-xs text-slate-500">{r.note ?? ""}</td>
                <td className="py-1.5 text-right">
                  {r.id === newestId && r.effective_from !== "1970-01-01" && (
                    <button
                      onClick={() => remove(r)}
                      disabled={busy}
                      className="text-xs text-rose-700 underline disabled:opacity-50"
                    >
                      undo
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
