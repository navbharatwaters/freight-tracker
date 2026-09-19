import { revalidatePath } from "next/cache";
import { query } from "./db";

/**
 * Published-rate markup rules. See db/migration_004_markup_rules.sql.
 *
 * One row per change. The freight_index_daily view picks, for each quote
 * date, the newest rule whose effective_from <= that date. So a new rule
 * moves future points only; history keeps what was in force at the time.
 *
 * Rules are append-only except for the newest one, which may be deleted to
 * undo a typo. Deleting anything older would silently rewrite published
 * history, so it is not offered.
 */

export type MarkupRule = {
  id: number;
  effective_from: string; // YYYY-MM-DD
  amount_usd: number;
  set_by: string;
  note: string | null;
  created_at: string;
  /** Points (date × lane) whose quote_date falls under this rule. */
  points: number;
};

export const MARKUP_MIN = 0;
export const MARKUP_MAX = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function listMarkupRules(): Promise<MarkupRule[]> {
  return query<MarkupRule>(`
    SELECT
      r.id,
      to_char(r.effective_from, 'YYYY-MM-DD') AS effective_from,
      r.amount_usd,
      r.set_by,
      r.note,
      r.created_at,
      (
        SELECT COUNT(*)::INT
        FROM (SELECT DISTINCT quote_date, origin_port, dest_port FROM freight_quotes) p
        WHERE p.quote_date >= r.effective_from
          AND p.quote_date < COALESCE(
            (SELECT MIN(n.effective_from) FROM markup_rules n WHERE n.effective_from > r.effective_from),
            'infinity'::date)
      ) AS points
    FROM markup_rules r
    ORDER BY r.effective_from DESC
  `);
}

/** The rule in force for quotes dated today. */
export async function currentMarkup(): Promise<MarkupRule | null> {
  const [r] = await query<MarkupRule>(`
    SELECT id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
           amount_usd, set_by, note, created_at, 0 AS points
    FROM markup_rules
    WHERE effective_from <= CURRENT_DATE
    ORDER BY effective_from DESC
    LIMIT 1
  `);
  return r ?? null;
}

/**
 * How many already-published points a rule starting on `effectiveFrom`
 * would change. Shown to the operator before they confirm a backdated rule.
 */
export async function previewImpact(effectiveFrom: string): Promise<number> {
  assertDate(effectiveFrom);
  const [r] = await query<{ n: number }>(
    `SELECT COUNT(*)::INT AS n
     FROM (SELECT DISTINCT quote_date, origin_port, dest_port FROM freight_quotes) p
     WHERE p.quote_date >= $1::date`,
    [effectiveFrom]
  );
  return r?.n ?? 0;
}

export async function addMarkupRule(input: {
  amount_usd: number;
  effective_from: string;
  set_by: string;
  note?: string | null;
}): Promise<MarkupRule> {
  const amount = Number(input.amount_usd);
  if (!Number.isInteger(amount) || amount < MARKUP_MIN || amount > MARKUP_MAX) {
    throw new Error(`amount_usd must be a whole number between ${MARKUP_MIN} and ${MARKUP_MAX}`);
  }
  assertDate(input.effective_from);

  const [row] = await query<MarkupRule>(
    `INSERT INTO markup_rules (effective_from, amount_usd, set_by, note)
     VALUES ($1::date, $2, $3, $4)
     ON CONFLICT (effective_from) DO UPDATE
       SET amount_usd = EXCLUDED.amount_usd,
           set_by     = EXCLUDED.set_by,
           note       = EXCLUDED.note,
           created_at = now()
     RETURNING id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
               amount_usd, set_by, note, created_at, 0 AS points`,
    [input.effective_from, amount, input.set_by || "admin", input.note?.trim() || null]
  );
  await flushPublished();
  return row;
}

/** Delete a rule -- only the newest one, and never the 1970 seed. */
export async function deleteNewestMarkupRule(id: number): Promise<void> {
  const [newest] = await query<{ id: number; effective_from: string }>(
    `SELECT id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from
     FROM markup_rules ORDER BY effective_from DESC LIMIT 1`
  );
  if (!newest || newest.id !== Number(id)) {
    throw new Error("only the newest rule can be deleted");
  }
  if (newest.effective_from === "1970-01-01") {
    throw new Error("the seed rule cannot be deleted; add a new one instead");
  }
  await query(`DELETE FROM markup_rules WHERE id = $1`, [id]);
  await flushPublished();
}

function assertDate(s: string) {
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error("effective_from must be YYYY-MM-DD");
  }
}

/**
 * The public pages and /api/index/* are ISR-cached for 15 minutes. A markup
 * change should show up on the next request, not a quarter of an hour later,
 * so drop those caches now.
 */
async function flushPublished() {
  for (const p of ["/", "/embed", "/api/index/daily", "/api/index/latest", "/api/index/summary"]) {
    try {
      revalidatePath(p);
    } catch {
      // Outside a request scope (tests, scripts) this throws; cache simply expires.
    }
  }
}
