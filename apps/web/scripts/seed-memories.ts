// Queues behaviour memories for the demo shop's seeded history (brief §6.10), marked "demo": true.
// Replays the ledger in order so each memory reflects what was known on its day. Dry run by default;
// --write queues them in the outbox. Then run scripts/outbox-run.ts to send them to Walrus.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { brokenPromiseEvents, eventsForNewEntries, type MemoryEvent } from "@trustbook/memory";
import { localDate, validateEntry } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { DEMO_SHOP_ID } from "../src/seed/demo";

const PER_CUSTOMER = Number(process.argv.find((a) => a.startsWith("--per="))?.slice(6) ?? 6);
const { db, closeDb, schema } = await import("../src/db/client");
const { enqueue } = await import("../src/memory/outbox");

const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, DEMO_SHOP_ID));
if (!shop) throw new Error("demo shop not seeded");
const rows = await db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt));
const entries = rows.map((r) => validateEntry(r.data));
const customers = await db.select().from(schema.customers).where(eq(schema.customers.shopId, shop.id));
const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
const ctxFor = (today: string) => ({ shopId: shop.id, settings, today, demo: true, customerName: (id: string) => customers.find((c) => c.id === id)?.name ?? id });

const all: MemoryEvent[] = [];
for (let i = 0; i < entries.length; i++) {
  const e = entries[i]!;
  all.push(...eventsForNewEntries(entries.slice(0, i), [e], ctxFor(localDate(e.occurredAt, shop.timezone))));
}
const today = localDate(new Date().toISOString(), shop.timezone);
all.push(...brokenPromiseEvents(entries, ctxFor(today)));

// Keep each customer's most recent facts (credit, payments, promises). Label changes are left out:
// replaying only on entry days misses changes caused by time passing, which would tell a wrong story.
const keep: MemoryEvent[] = [];
for (const c of customers) {
  const mine = all.filter((m) => m.customerId === c.id && m.kind !== "label_change").sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  keep.push(...mine.slice(-PER_CUSTOMER));
}
const byNs = keep.reduce<Record<string, number>>((m, e) => ((m[e.namespace] = (m[e.namespace] ?? 0) + 1), m), {});
const byKind = keep.reduce<Record<string, number>>((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
console.log(`${all.length} possible memories; keeping ${keep.length}`, JSON.stringify(byKind));
console.log("per namespace:", JSON.stringify(byNs));
for (const e of keep.filter((m) => m.customerId === "cust-tunde")) console.log("  Tunde:", JSON.parse(e.content).summary);
if (process.argv.includes("--write")) console.log(`queued ${await enqueue(shop.id, true, keep)} new memories`);
else console.log("Dry run only. Pass --write to queue them.");
await closeDb();
