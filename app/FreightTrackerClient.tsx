"use client";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { UiRow } from "./page";

const DESTS = ["NHAVA SHEVA", "CHENNAI", "KOLKATA"] as const;
const DAY = 86_400_000;

const RANGES = [
  { key: "3M", label: "3 months", days: 90 },
  { key: "6M", label: "6 months", days: 182 },
  { key: "ALL", label: "All", days: null },
] as const;

// Mail arrives when rates move, not on a schedule -- 5-8 day gaps are normal
// and must still be drawn as one continuous line. A silence beyond this is
// not a slow week, it is missing history, and joining across it would draw a
// trend nobody measured. Those get a genuine break in the line instead.
const GAP_DAYS = 21;

type Point = {
  t: number;
  date: string;
  rate20: number | null;
  rate40: number | null;
  n20: number;
  n40: number;
};

/** Evenly spaced axis ticks. One tick per observation is unreadable at 66. */
function pickTicks(points: Point[], max = 8): number[] {
  if (points.length <= max) return points.map((p) => p.t);
  const step = (points.length - 1) / (max - 1);
  const out = new Set<number>();
  for (let i = 0; i < max; i++) out.add(points[Math.round(i * step)].t);
  return [...out];
}
const ts = (d: string) => new Date(d + "T00:00:00Z").getTime();
const fmtShort = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtLong = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function FreightTrackerClient({
  data,
  error,
  source = "db",
  embed = false,
}: {
  data: UiRow[];
  error: string | null;
  source?: "db" | "static";
  /**
   * Rendered inside a partner's page (iKargos) rather than standing alone.
   * Drops only the outer chrome -- the wordmark, the h1 and the tagline, which
   * the host page supplies itself, plus the full-height page padding.
   *
   * Everything that carries meaning stays: the controls, the chart, the table,
   * the quote counts, the thin-data warning and the methodology/limits note.
   * That note is the accuracy and liability statement, and embed visitors are
   * strangers with no other context -- they need it most. Do not strip it.
   */
  embed?: boolean;
}) {
  const [dest, setDest] = useState<string>("NHAVA SHEVA");
  const [origin, setOrigin] = useState<string>("SHENZHEN");
  const [range, setRange] = useState<string>("ALL");

  const LATEST = useMemo(
    () => data.reduce((m, r) => (r.date > m ? r.date : m), ""),
    [data]
  );

  const origins = useMemo(
    () => [...new Set(data.filter((r) => r.dest === dest).map((r) => r.origin))].sort(),
    [data, dest]
  );
  const activeOrigin = origins.includes(origin) ? origin : origins[0] ?? "";

  // Every observation on this lane, oldest first.
  const lane = useMemo<Point[]>(
    () =>
      data
        .filter((r) => r.dest === dest && r.origin === activeOrigin)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ ...r, t: ts(r.date) })),
    [data, dest, activeOrigin]
  );

  // Trailing window, measured back from the newest observation on the lane
  // rather than from today -- "3 months" of a feed that went quiet in August
  // should still show August.
  const points = useMemo<Point[]>(() => {
    const days = RANGES.find((r) => r.key === range)?.days;
    if (!days || !lane.length) return lane;
    const cutoff = lane[lane.length - 1].t - days * DAY;
    const win = lane.filter((p) => p.t >= cutoff);
    return win.length > 1 ? win : lane;
  }, [lane, range]);

  // Chart rows = observations plus an explicit null spacer inside any long
  // silence, so `connectNulls={false}` breaks the line there instead of
  // drawing a straight run across two months of missing mail.
  const series = useMemo(() => {
    const out: (Point & { gap?: boolean })[] = [];
    points.forEach((p, i) => {
      const prev = points[i - 1];
      if (prev && p.t - prev.t > GAP_DAYS * DAY) {
        out.push({
          t: Math.round((prev.t + p.t) / 2),
          date: "",
          rate20: null,
          rate40: null,
          n20: 0,
          n40: 0,
          gap: true,
        });
      }
      out.push(p);
    });
    return out;
  }, [points]);

  const latest = points[points.length - 1];
  const first = points[0];
  const pct = (a?: number | null, b?: number | null) =>
    a && b ? (((b - a) / a) * 100).toFixed(1) : null;
  const d20 = pct(first?.rate20, latest?.rate20);
  const d40 = pct(first?.rate40, latest?.rate40);
  const thin = points.some((s) => s.n40 > 0 && s.n40 < 5);
  const spanDays = points.length > 1 ? Math.round((latest.t - first.t) / DAY) : 0;
  const gaps = series.filter((s) => s.gap).length;

  const table = useMemo(
    () =>
      data
        .filter((r) => r.dest === dest && r.date === LATEST)
        .sort((a, b) => (b.rate40 || 0) - (a.rate40 || 0)),
    [data, dest, LATEST]
  );

  const pad = Math.max(DAY, Math.round((spanDays * DAY) / 60));
  const domain: [number, number] = points.length
    ? [first.t - pad, latest.t + pad]
    : [0, 1];
  const ticks = useMemo(() => pickTicks(points), [points]);
  // Dots stop being informative once they touch; past ~45 points, drop them
  // and let the hover marker do the work.
  const dotSize = points.length > 45 ? 0 : points.length > 25 ? 2 : 3;

  // Embedded, these states sit inside a partner's page: no min-h-screen (it
  // would leave a screen-tall blank hole in their layout) and no heading of
  // our own. Also no raw error text -- that can name our host or database, and
  // a stranger on ikargos.com can do nothing with it. The detail stays on the
  // standalone page, where the operator reads it.
  const shellClass = embed
    ? "bg-white text-slate-900 p-4"
    : "min-h-screen bg-white text-slate-900 p-10";

  if (error) {
    return (
      <div className={shellClass}>
        <div className="max-w-2xl mx-auto space-y-3">
          {!embed && <h1 className="text-xl font-semibold">Freight Tracker</h1>}
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
            {embed ? "Rate data is temporarily unavailable. Please check back shortly." : `Data unavailable. ${error}`}
          </p>
        </div>
      </div>
    );
  }
  if (!data.length) {
    return (
      <div className={shellClass}>
        <div className="max-w-2xl mx-auto space-y-3">
          {!embed && <h1 className="text-xl font-semibold">Freight Tracker</h1>}
          <p className="text-sm text-slate-600">No rate data yet. Check back once the pipeline has ingested at least one email.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embed
          ? "bg-white text-slate-900 p-4 md:p-5"
          : "min-h-screen bg-white text-slate-900 p-5 md:p-10"
      }
    >
      <div className="max-w-4xl mx-auto space-y-7">
        <header className={embed ? "" : "border-b border-slate-200 pb-5"}>
          {!embed && (
            <>
              <p className="text-[11px] tracking-[0.22em] uppercase text-slate-500">iKargos</p>
              <h1 className="text-2xl md:text-4xl font-semibold mt-2 tracking-tight">
                China → India Freight Tracker
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                Indicative spot rates · updated when carriers revise pricing, not on a fixed schedule
              </p>
            </>
          )}
          <div className={`flex flex-wrap items-center gap-2 ${embed ? "" : "mt-3"}`}>
            <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Rates as of {fmtLong(ts(LATEST))}
            </span>
            <span className="text-xs text-slate-500">
              {points.length} observations over {spanDays} days
            </span>
            {source === "static" && (
              <span className="text-[11px] text-slate-400" title="data/index.json, rebuilt by update.py">
                static snapshot
              </span>
            )}
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              Destination
            </label>
            <select
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[160px]"
            >
              {DESTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              Origin port
            </label>
            <select
              value={activeOrigin}
              onChange={(e) => setOrigin(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[160px]"
            >
              {origins.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              Range
            </label>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  title={r.label}
                  className={`px-3 py-2 text-sm border-l first:border-l-0 border-slate-300 ${
                    range === r.key
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { l: "20ft", v: latest?.rate20, d: d20, n: latest?.n20 },
            { l: "40ft / 40HQ", v: latest?.rate40, d: d40, n: latest?.n40 },
          ].map((c) => (
            <div key={c.l} className="border border-slate-200 rounded-lg p-4 md:p-5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</p>
              <p className="text-2xl md:text-3xl font-semibold mt-1 tabular-nums">
                {c.v ? `$${c.v.toLocaleString()}` : "—"}
              </p>
              {c.d && (
                <p className={`text-xs mt-1 ${Number(c.d) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {Number(c.d) > 0 ? "▲" : "▼"} {Math.abs(Number(c.d))}% over {spanDays} days
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-0.5">{c.n} carrier quotes</p>
            </div>
          ))}
        </div>

        <section className="border border-slate-200 rounded-lg p-4 md:p-5">
          <h2 className="text-sm font-semibold">{activeOrigin} → {dest}</h2>
          <p className="text-xs text-slate-500 mb-4">
            Average rate per container, USD · each dot is one rate update from the agent
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series} margin={{ top: 5, right: 8, bottom: 5, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={domain}
                ticks={ticks}
                tickFormatter={fmtShort}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={["dataMin - 100", "dataMax + 100"]}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelFormatter={(l, pl) =>
                  pl?.[0]?.payload?.gap ? "No rate mail in this period" : fmtLong(Number(l))
                }
                formatter={(v, n, p: { payload?: Point & { gap?: boolean } }) => {
                  if (p.payload?.gap) return ["", ""];
                  const cnt = n === "20ft" ? p.payload?.n20 : p.payload?.n40;
                  return [v ? `$${Number(v).toLocaleString()} · ${cnt} quotes` : "—", String(n)];
                }}
              />
              <Legend iconType="line" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              {/* connectNulls stays OFF: the null spacers are the gap breaks. */}
              <Line
                type="linear"
                dataKey="rate20"
                name="20ft"
                stroke="#94a3b8"
                strokeWidth={2}
                dot={dotSize ? { r: dotSize } : false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
              <Line
                type="linear"
                dataKey="rate40"
                name="40ft"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={dotSize ? { r: dotSize + 0.5 } : false}
                activeDot={{ r: 4.5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Points are spaced by actual calendar date. Short gaps mean no rate update was issued in that
            period — typically because pricing held steady or sailings were closed. A flat segment is not a
            measured trend, only the absence of a revision.
            {gaps > 0 && (
              <>
                {" "}
                A <strong className="text-slate-700">break in the line</strong> marks a stretch of more than{" "}
                {GAP_DAYS} days with no mail at all: the rate either side is real, the path between them is
                not known and is deliberately not drawn.
              </>
            )}
          </p>

          {thin && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2">
              Some points on this lane come from fewer than 5 carrier quotes — treat movement with caution.
            </p>
          )}
        </section>

        <section className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">All origins → {dest}</h2>
            <span className="text-[11px] text-slate-500">as of {fmtShort(ts(LATEST))}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Origin</th>
                <th className="text-right px-4 py-2 font-medium">20ft</th>
                <th className="text-right px-4 py-2 font-medium">40ft</th>
                <th className="text-right px-4 py-2 font-medium">Quotes</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr
                  key={r.origin}
                  onClick={() => setOrigin(r.origin)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${
                    r.origin === activeOrigin ? "bg-slate-50" : ""
                  }`}
                >
                  <td className="px-4 py-2 capitalize">{r.origin.toLowerCase()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.rate20 ? `$${r.rate20}` : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{r.rate40 ? `$${r.rate40}` : "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-400 tabular-nums">{r.n40}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="border-t border-slate-200 pt-5 space-y-3 text-xs text-slate-500 leading-relaxed">
          <p>
            <strong className="text-slate-700">How this is calculated.</strong> Each point is the simple average of
            every carrier quotation received for that lane on that date. 40HQ is treated as 40ft. Carrier identities
            are not disclosed. Quote counts are shown so you can judge how much weight a point carries.
          </p>
          <p>
            <strong className="text-slate-700">Coverage and limits.</strong> Rates are compiled from a single freight
            forwarding source and reflect that forwarder&apos;s book, not the whole market. Updates arrive when
            carriers revise pricing, so intervals are irregular. This tracker indicates market{" "}
            <em>direction</em> only — it is not a quotation, not a booking offer, and should not be used to price a
            shipment. Actual rates vary by volume, commodity, equipment availability and sailing date.
          </p>
        </div>
      </div>
    </div>
  );
}
