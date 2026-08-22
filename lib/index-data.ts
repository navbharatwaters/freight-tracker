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
