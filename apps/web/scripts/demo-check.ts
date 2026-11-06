// Read-only check before recording the demo (docs/DEMO.md). Changes nothing.
// Usage: npx tsx scripts/demo-check.ts
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
const { db, schema, closeDb } = await import("../src/db/client");
const { asc, desc, eq } = await import("drizzle-orm");
const L = await import("@trustbook/ledger");
const chain = await import("@trustbook/chain");
const { relayerHealth } = await import("@trustbook/memory");
const { DEMO_SHOP_ID } = await import("../src/seed/demo");

const line = (ok: boolean, label: string, detail: string) => console.log(`${ok ? "OK  " : "FIX "} ${label.padEnd(22)} ${detail}`);
const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, DEMO_SHOP_ID));
if (!shop) throw new Error("demo shop missing");
const today = L.localDate(new Date().toISOString(), shop.timezone);

const relayer = await relayerHealth();
line(relayer.ok, "Walrus Memory relayer", relayer.ok ? "reachable" : relayer.detail);
try {
  const cp = await chain.latestCheckpoint();
  line(true, "Tatum (Sui GraphQL)", `checkpoint ${cp.sequenceNumber}`);
} catch (e) {
  line(false, "Tatum (Sui GraphQL)", (e as Error).message);
}
const anchor = shop.anchorObjectId ? await chain.readAnchor(shop.anchorObjectId).catch(() => null) : null;
const [lastSeal] = await db.select({ toDate: schema.seals.toDate }).from(schema.seals).where(eq(schema.seals.shopId, shop.id)).orderBy(desc(schema.seals.toDate)).limit(1);
const yesterday = L.addDays(today, -1);
line(lastSeal?.toDate === yesterday || !lastSeal, "Sealed through", `${lastSeal?.toDate ?? "nothing"} (yesterday is ${yesterday}); anchor says ${anchor ? `${anchor.dayCount} days to ${anchor.lastDay}` : "unreadable"}`);
const sui = Number((await chain.tatum().core.getBalance({ owner: chain.sponsorAddress(), coinType: "0x2::sui::SUI" })).balance.balance) / 1e9;
line(sui > 0.05, "Sponsor wallet", `${sui.toFixed(3)} SUI for gas`);

const rows = await db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt));
const entries = rows.map((r) => L.validateEntry(r.data));
const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
const debts = L.computeDebts(L.effectiveEntries(entries), settings, today);
const customers = await db.select().from(schema.customers).where(eq(schema.customers.shopId, shop.id));
console.log("\nCustomers today:");
for (const c of customers) {
  const t = L.trustLabel(debts, c.id, c.labelOverride ?? undefined);
  console.log(`  ${c.name.padEnd(8)} ${t.label.padEnd(15)} owes ${L.formatNaira(debts.balances.get(c.id)?.owedKobo ?? 0).padEnd(9)} ${t.evidence}`);
}

// The demo's visible label change: Emeka takes ₦5,000 credit, then pays everything he owes today.
const at = (t: string) => L.instantAt(today, t, shop.timezone);
const items = await db.select().from(schema.items).where(eq(schema.items.shopId, shop.id));
const item = items[0]!;
const base = (id: string, t: string) => ({ id, shopId: shop.id, occurredAt: at(t), recordedAt: at(t), source: "manual" as const, confirmedBy: "check" });
const sale = L.validateEntry({ ...base("chk-sale", "10:00"), type: "SALE", items: [{ itemId: item.id, qty: 1, unitPriceKobo: 500_000 }], totalKobo: 500_000, paidNowKobo: 0, customerId: "cust-emeka", promisedDate: L.addDays(today, 3) });
const owed = L.computeDebts(L.effectiveEntries([...entries, sale]), settings, today).balances.get("cust-emeka")?.owedKobo ?? 0;
const pay = L.validateEntry({ ...base("chk-pay", "15:00"), type: "PAYMENT", customerId: "cust-emeka", amountKobo: owed, method: "cash", allocations: [] });
const before = L.trustLabel(debts, "cust-emeka").label;
const after = L.trustLabel(L.computeDebts(L.effectiveEntries([...entries, sale, pay]), settings, today), "cust-emeka");
line(before !== after.label, "Emeka label change", `${before} → ${after.label} (${after.evidence}) if he takes ₦5,000 credit and pays all ${L.formatNaira(owed)} today`);
await closeDb();
