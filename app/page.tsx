import FreightTrackerClient from "./FreightTrackerClient";
import { query } from "@/lib/db";

type IndexRow = {
  quote_date: string;
  origin_port: string;
  dest_port: string;
  rate_20: number | null;
  rate_40: number | null;
  n_20: number;
  n_40: number;
};

export type UiRow = {
  date: string;
  origin: string;
  dest: string;
  rate20: number | null;
  rate40: number | null;
  n20: number;
  n40: number;
};

export const revalidate = 900;

async function fetchRows(): Promise<UiRow[]> {
  const rows = await query<IndexRow>(`
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

export default async function Page() {
  let data: UiRow[] = [];
  let error: string | null = null;
  try {
    data = await fetchRows();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return <FreightTrackerClient data={data} error={error} />;
}
