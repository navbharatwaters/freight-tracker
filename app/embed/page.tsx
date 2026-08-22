import type { Metadata } from "next";
import FreightTrackerClient from "../FreightTrackerClient";
import { getIndexRows } from "@/lib/index-data";

/**
 * Public, no-login rate chart, built to be iframed into a partner's site --
 * iKargos is the first embedder.
 *
 * It renders the SAME component as `/`, with `embed` set. One codebase, so a
 * chart fix or a methodology change reaches the partner page on our next
 * deploy and cannot drift into a stale fork. (We have already been bitten
 * twice by pasted copies drifting -- see TODO.md and the n8n Code node.)
 *
 * Read-only and anonymous: the same averaged numbers `/` already serves
 * publicly. No writes, no forms, no tokens -- nothing to clickjack or CSRF
 * into, which is what makes it safe to drop X-Frame-Options here.
 *
 * Framing is allowed by `Content-Security-Policy: frame-ancestors` scoped to
 * this path in next.config.mjs, plus the matching Caddy change that stops
 * sending X-Frame-Options on /embed only. Both are required: Caddy adds
 * SAMEORIGIN to every response, and relying on CSP alone to override it is a
 * thin margin for a partner-facing page.
 */
export const metadata: Metadata = {
  title: "China → India Freight Rates",
  description:
    "Indicative China to India ocean freight spot rates by lane — 20ft and 40ft averages from carrier quotations.",
  // The canonical, linkable version is the partner page that frames this. An
  // indexed bare iframe target would compete with it in search for no benefit,
  // and the crawlable rates table lives on the partner page, not in here.
  robots: { index: false, follow: false },
};

export const revalidate = 900;

export default async function EmbedPage() {
  const { rows, source, error } = await getIndexRows();
  return <FreightTrackerClient data={rows} error={error} source={source} embed />;
}
