import FreightTrackerClient from "./FreightTrackerClient";
import { getIndexRows } from "@/lib/index-data";

export type { UiRow } from "@/lib/index-data";

export const revalidate = 900;

export default async function Page() {
  const { rows, source, error } = await getIndexRows();
  return <FreightTrackerClient data={rows} error={error} source={source} />;
}
