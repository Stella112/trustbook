import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Supabase's transaction pooler does not support prepared statements.
const sql = postgres(url, { prepare: false, max: 5 });

export const db = drizzle(sql, { schema });
export const closeDb = () => sql.end({ timeout: 5 });
export { schema };
