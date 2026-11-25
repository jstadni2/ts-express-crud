import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./models.js";

/**
 * Postgres `date` values are kept as plain "YYYY-MM-DD" strings (matching
 * Python's `date.isoformat()` output used across the Flask templates).
 */
pg.types.setTypeParser(1082, (value: string) => value);

/**
 * Postgres `timestamptz` values are formatted as "YYYY-MM-DD HH:MM:SS"
 * (matching Python's `datetime.strftime('%Y-%m-%d %H:%M:%S')` used in the
 * systems list).
 */
pg.types.setTypeParser(1184, (value: string): string => {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
});

function databaseUrl(): string {
  // Accept both node-postgres URLs and Flask-style SQLAlchemy URLs.
  const url = process.env.DATABASE_URL ?? "postgresql://avdb:avdb@localhost:5432/avdb";
  return url.replace("+psycopg2", "");
}

export const pool = new pg.Pool({ connectionString: databaseUrl() });

export const db = drizzle(pool, { schema });

export async function closePool(): Promise<void> {
  await pool.end();
}
