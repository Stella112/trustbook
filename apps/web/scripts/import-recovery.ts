// Imports what tools/recovery rebuilt into an EMPTY database (brief §6.8).
//   npx tsx scripts/import-recovery.ts <dir with ledger.json and memories.json> [--database-url <url>] [--pin <6 digits>]
// --database-url points the import at a fresh database (e.g. the rehearsal copy) instead of DATABASE_URL.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";

config({ path: "../../.env", quiet: true });
const { values, positionals } = parseArgs({ allowPositionals: true, options: { "database-url": { type: "string" }, pin: { type: "string" } } });
if (values["database-url"]) process.env.DATABASE_URL = values["database-url"];
const dir = positionals[0];
if (!dir) {
  console.error("usage: import-recovery.ts <recovered dir> [--database-url <url>] [--pin <6 digits>]");
  process.exit(2);
}
const books = JSON.parse(readFileSync(join(resolve(dir), "ledger.json"), "utf8"));
const memories = JSON.parse(readFileSync(join(resolve(dir), "memories.json"), "utf8"));
const { importRecovered } = await import("../src/recovery/import");
const { closeDb } = await import("../src/db/client");
try {
  const r = await importRecovered(books, memories, { pin: values.pin, log: (l) => console.log(l) });
  console.log(`imported ${books.shop.name}:`, JSON.stringify(r));
} catch (err) {
  console.error(`import refused: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
