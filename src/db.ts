import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./models.js";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://avdb:avdb@localhost:5432/avdb";

export const pool = new Pool({ connectionString });

// Prevent a dropped database connection from crashing the process; log instead.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

export const db = drizzle(pool, { schema });

export { schema };