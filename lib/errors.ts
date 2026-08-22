/**
 * Turn a thrown value into something a human can act on.
 *
 * node-pg throws an AggregateError when every candidate address for the host
 * fails. Its own `.message` is the empty string, so the admin panel rendered a
 * blank red box -- the failure was real but told you nothing. Unwrap the
 * aggregate, and surface the pg error `code` when there is one, because that
 * is what names the actual problem (28P01 bad password, 42P10 the ON CONFLICT
 * target has no matching index, ECONNREFUSED nothing listening).
 */
export function describeError(e: unknown): string {
  if (e == null) return "unknown error";

  if (typeof e === "string") return e;

  if (e instanceof Error) {
    const parts: string[] = [];

    // AggregateError: every connection attempt failed. The detail is inside.
    const inner = (e as AggregateError).errors;
    if (Array.isArray(inner) && inner.length) {
      const seen = new Set<string>();
      for (const sub of inner) {
        const d = describeError(sub);
        if (d && !seen.has(d)) seen.add(d);
      }
      const joined = [...seen].join("; ");
      if (joined) parts.push(joined);
    }

    if (e.message) parts.push(e.message);

    const code = (e as NodeJS.ErrnoException).code;
    if (code) parts.push(`(${code})`);

    // pg attaches these on server-side errors and they are the useful bit.
    const detail = (e as { detail?: string }).detail;
    if (detail) parts.push(detail);
    const hint = (e as { hint?: string }).hint;
    if (hint) parts.push(`hint: ${hint}`);

    if (parts.length) return parts.join(" ");
    return e.name || "unknown error";
  }

  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
