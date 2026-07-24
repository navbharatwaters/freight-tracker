import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params as never);
  return res.rows as T[];
}
