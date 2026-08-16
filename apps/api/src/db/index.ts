import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import { runMigrations } from "./migrations";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: env.databaseUrl });
export const db = drizzle(pool, { schema });
export { schema };

// Top-level await: migrations complete before any route handler runs.
// ESM module evaluation is async so this is safe without a wrapper.
await runMigrations(pool);
