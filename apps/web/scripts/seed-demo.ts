// Seeds the demo shop "Mama Ngozi Provisions". Dry run by default: prints labels and month totals.
// Pass --write to insert into the database. Entries are append-only, so this refuses to run twice.
import { config } from "dotenv";
import { computeDebts, effectiveEntries, localDate, monthSummary, trustLabel, addDays } from "@trustbook/ledger";
import { buildDemoEntries, DEMO_CUSTOMERS, DEMO_ITEMS, DEMO_SHOP, DEMO_SHOP_ID, demoSettings } from "../src/seed/demo";

config({ path: "../../.env" });
const write = process.argv.includes("--write");
const naira = (kobo: number | null) => (kobo === null ? "unavailable" : `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

const today = localDate(new Date().toISOString(), DEMO_SHOP.timezone);
const lastDay = addDays(today, -1);
const entries = buildDemoEntries(lastDay);
const counts = entries.reduce<Record<string, number>>((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
console.log(`${entries.length} entries, ${entries[0]!.occurredAt.slice(0, 10)} to ${lastDay}:`, JSON.stringify(counts));

const state = computeDebts(effectiveEntries(entries), demoSettings, lastDay);
console.log("\nCustomers (as of", lastDay + ")");
for (const c of DEMO_CUSTOMERS) {
  const t = trustLabel(state, c.id);
  const b = state.balances.get(c.id);
  console.log(`  ${c.name.padEnd(8)} ${t.label.padEnd(15)} owes ${naira(b?.owedKobo ?? 0).padEnd(10)} credit ${naira(b?.creditKobo ?? 0).padEnd(8)} | ${t.evidence}${t.suggestedLimitKobo ? ` | limit ${naira(t.suggestedLimitKobo)}` : ""}`);
}
const months = [...new Set(entries.map((e) => localDate(e.occurredAt, DEMO_SHOP.timezone).slice(0, 7)))];
for (const m of months) {
  const { period: p, position: pos } = monthSummary(entries, demoSettings, m, lastDay);
  console.log(`\nMonth ${m}${m === today.slice(0, 7) ? " (to date)" : ""}`);
  console.log(`  Sales ${naira(p.revenueKobo)} (${p.salesCount} sales) · cash collected ${naira(p.cashCollectedKobo)} · stock bought ${naira(p.purchasesKobo)} · expenses ${naira(p.expensesKobo)}`);
  console.log(`  Cost of goods ${naira(p.cogsKobo)} · gross profit ${naira(p.grossProfitKobo)} · net profit ${naira(p.netProfitKobo)}${p.itemsWithoutCost.length ? ` · no cost: ${p.itemsWithoutCost.join(", ")}` : ""}`);
  console.log(`  At ${pos.asOf}: cash ${naira(pos.cashOnHandKobo)} · stock ${naira(pos.stockValueKobo)} · owed to shop ${naira(pos.receivablesKobo)} (overdue ${naira(pos.overdueKobo)}) · owed to supplier ${naira(pos.supplierOwedKobo)} · net position (estimate) ${naira(pos.netPositionKobo)}${pos.stockWarnings.length ? ` · warnings ${JSON.stringify(pos.stockWarnings)}` : ""}`);
}

if (!write) {
  console.log("\nDry run only. Pass --write to insert.");
  process.exit(0);
}

const { db, closeDb, schema } = await import("../src/db/client");
const { eq } = await import("drizzle-orm");
const existing = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.id, DEMO_SHOP_ID));
if (existing.length) {
  console.log(`\nDemo shop already exists; entries are append-only, so nothing was written.`);
  await closeDb();
  process.exit(1);
}
await db.transaction(async (tx) => {
  await tx.insert(schema.shops).values(DEMO_SHOP);
  await tx.insert(schema.customers).values(DEMO_CUSTOMERS.map((c) => ({ ...c, shopId: DEMO_SHOP_ID })));
  await tx.insert(schema.items).values(DEMO_ITEMS.map((i) => ({ id: i.id, shopId: DEMO_SHOP_ID, name: i.name, unit: i.unit })));
  for (let i = 0; i < entries.length; i += 200) {
    await tx.insert(schema.entries).values(
      entries.slice(i, i + 200).map((e) => ({
        id: e.id,
        shopId: e.shopId,
        type: e.type,
        occurredAt: new Date(e.occurredAt),
        recordedAt: new Date(e.recordedAt),
        customerId: "customerId" in e ? (e.customerId ?? null) : null,
        data: e,
      })),
    );
  }
});
console.log(`\nWrote demo shop with ${entries.length} entries.`);
await closeDb();
