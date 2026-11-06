// Seals a shop's closed days to Walrus and updates its Sui anchor (brief §6.8). Defaults to the demo shop.
// For seeded history the anchor moves once per weekly batch; say so in the report.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
const shopId = process.argv[2] ?? "demo-mama-ngozi";
const { sealShopExclusive } = await import("../src/recovery/seal");
const { closeDb } = await import("../src/db/client");
const t0 = Date.now();
const r = await sealShopExclusive(shopId, { through: process.argv[3], log: (l) => console.log(l) });
if (r.skipped) console.log(`skipped: ${r.reason}`);
else console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s:`, JSON.stringify({ anchor: r.anchorId, batches: r.batches.length, checkpoints: r.checkpoints, dayCount: r.dayCount, stoppedEarly: r.stoppedEarly }));
await closeDb();
