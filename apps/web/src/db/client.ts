import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let sql: ReturnType<typeof postgres> | undefined;
let instance: Db | undefined;

/**
 * Connects on first use, not when the module loads. `next build` loads route modules to collect
 * their settings and must not need the database or its URL (seen on Vercel, 6 Nov); a missing URL
 * still fails loudly, on the first real query.
 */
function connect(): Db {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase's transaction pooler does not support prepared statements.
  sql = postgres(url, { prepare: false, max: 5 });
  instance = drizzle(sql, { schema });
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connect();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export const closeDb = async () => {
  if (sql) await sql.end({ timeout: 5 });
};
export { schema };
