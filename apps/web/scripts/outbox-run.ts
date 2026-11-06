// Runs the memory outbox worker from the command line, e.g. after seeding. Repeats until nothing waits.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
const { processOutbox } = await import("../src/memory/outbox");
const { closeDb } = await import("../src/db/client");
for (let round = 1; round <= Number(process.argv[2] ?? 10); round++) {
  const run = await processOutbox(60_000);
  console.log(`round ${round}:`, JSON.stringify(run));
  if (run.stillWaiting === 0) break;
}
await closeDb();
