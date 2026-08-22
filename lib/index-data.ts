import { promises as fs } from "node:fs";
import path from "node:path";
import { query } from "./db";

export type UiRow = {
  date: string;
  origin: string;
  dest: string;
  rate20: number | null;
  rate40: number | null;
  n20: number;
  n40: number;
};

export type IndexSource = "db" | "static";

type DbRow = {
  quote_date: string;
  origin_port: string;
  dest_port: string;
  rate_20: number | null;
  rate_40: number | null;
  n_20: number;
  n_40: number;
};

async function fromDb(): Promise<UiRow[]> {
  const rows = await query<DbRow>(`
    SELECT
      to_char(quote_date, 'YYYY-MM-DD') AS quote_date,
      origin_port, dest_port, rate_20, rate_40, n_20, n_40
    FROM freight_index_daily
    ORDER BY quote_date, dest_port, origin_port
  `);
  return rows.map((r) => ({
    date: r.quote_date,
    origin: r.origin_port,
    dest: r.dest_port,
    rate20: r.rate_20,
    rate40: r.rate_40,
    n20: r.n_20,
    n40: r.n_40,
  }));
}

/**
 * Static fallback: data/index.json, written by `python update.py`.
 *
 * Same shape and same plain-mean methodology as the freight_index_daily view --
 * update.py aggregates from the identical parser. It exists so the chart still
 * renders on a machine with no Postgres. Postgres remains the source of truth
 * whenever DATABASE_URL is set and reachable.
 */
async function fromStatic(): Promise<UiRow[]> {
  const file = path.join(process.cwd(), "data", "index.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as UiRow[];
}

// ============================================================
// Presentation-ready summary, for partner sites (iKargos).
//
// The payload carries its own COLUMNS, HEADING and NOTE. The partner page is a
// blind map() over what it receives -- it does no maths, no formatting, no date
// handling and hard-codes no column list.
//
// That is the whole point: adding a lane, adding a column, rewording the
// disclaimer or changing the averaging becomes a deploy HERE and nothing on
// their side. Their page is written once. Keep it that way -- if you find
// yourself needing the partner to change their component to ship a feature,
// the change belongs in this payload instead.
// ============================================================

export type SummaryColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type SummaryRow = {
  lane: string;
  origin: string;
  dest: string;
  r20: string;
  r40: string;
  n: number;
  delta: string;
  /**
   * This lane's own most recent quoted date. Today every lane is quoted on the
   * same day, so it is redundant -- but if the agent ever stops quoting a lane,
   * a stale row would otherwise sit beside fresh ones with nothing to say so.
   * Carried as data, not as a column: surfacing it later is a change here, with
   * no work on the partner's side.
   */
  as_of: string;
};

export type IndexSummary = {
  as_of: string | null;
  heading: string;
  columns: SummaryColumn[];
  rows: SummaryRow[];
  note: string;
  source: IndexSource;
  updated_at: string;
};

const DELTA_WINDOW_DAYS = 30;
const usd = (v: number | null) => (v == null ? "—" : `$${v.toLocaleString("en-US")}`);
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const laneName = (origin: string, dest: string) => `${title(origin)} → ${title(dest)}`;

export async function getIndexSummary(): Promise<IndexSummary> {
  const { rows, source } = await getIndexRows();

  const asOf = rows.reduce((m, r) => (r.date > m ? r.date : m), "");

  // One row per lane, at its own most recent observation. Lanes are quoted on
  // different days, so pinning every lane to the newest global date would drop
  // any lane the agent did not mention that day.
  const byLane = new Map<string, UiRow[]>();
  for (const r of rows) {
    const k = `${r.origin}|${r.dest}`;
    const bucket = byLane.get(k);
    if (bucket) bucket.push(r);
    else byLane.set(k, [r]);
  }

  const out: SummaryRow[] = [];
  for (const series of byLane.values()) {
    series.sort((a, b) => a.date.localeCompare(b.date));
    const latest = series[series.length - 1];
    if (!latest) continue;

    // Compare against the newest observation at least DELTA_WINDOW_DAYS old.
    // Mail is irregular, so "30 days ago" rarely lands on an actual quote date.
    const cutoff = new Date(
      new Date(`${latest.date}T00:00:00Z`).getTime() - DELTA_WINDOW_DAYS * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const prior = [...series].reverse().find((r) => r.date <= cutoff);

    let delta = "—";
    if (prior?.rate40 && latest.rate40) {
      const pct = ((latest.rate40 - prior.rate40) / prior.rate40) * 100;
      delta = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
    }

    out.push({
      lane: laneName(latest.origin, latest.dest),
      origin: latest.origin,
      dest: latest.dest,
      r20: usd(latest.rate20),
      r40: usd(latest.rate40),
      n: latest.n40 || latest.n20,
      delta,
      as_of: latest.date,
    });
  }

  out.sort((a, b) => a.dest.localeCompare(b.dest) || a.origin.localeCompare(b.origin));

  return {
    as_of: asOf || null,
    heading: "China → India ocean freight — indicative spot rates",
    columns: [
      { key: "lane", label: "Lane" },
      { key: "r20", label: "20ft", align: "right" },
      { key: "r40", label: "40ft / 40HQ", align: "right" },
      { key: "n", label: "Quotes", align: "right" },
      { key: "delta", label: `${DELTA_WINDOW_DAYS}-day change`, align: "right" },
    ],
    rows: out,
    note:
      "Each figure is the simple average of every carrier quotation received for that lane " +
      "on its most recent quoted date. 40HQ is treated as 40ft. Rates are compiled from a " +
      "single freight forwarding source and indicate market direction only — this is not a " +
      "quotation and not a booking offer. Actual rates vary by volume, commodity, equipment " +
      "availability and sailing date.",
    source,
    updated_at: new Date().toISOString(),
  };
}

export async function getIndexRows(): Promise<{
  rows: UiRow[];
  source: IndexSource;
  error: string | null;
}> {
  let error: string | null = null;

  if (process.env.DATABASE_URL) {
    try {
      const rows = await fromDb();
      if (rows.length) return { rows, source: "db", error: null };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  try {
    return { rows: await fromStatic(), source: "static", error: null };
  } catch (e) {
    return {
      rows: [],
      source: "static",
      error: error ?? (e instanceof Error ? e.message : String(e)),
    };
  }
}
