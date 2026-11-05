import { formatNaira, localDate, monthSummary, validateEntry } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "../src/db/client";
import { currentShop } from "../src/lib/shop";

export const dynamic = "force-dynamic";

/** Phase 1 home: proves a shop's ledger loads and computes. The full Look screens come in Phase 2. */
export default async function Home() {
  const shop = await currentShop();
  if (!shop) redirect("/onboarding");

  const rows = await db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt));
  const entries = rows.map((r) => validateEntry(r.data));
  const today = localDate(new Date().toISOString(), shop.timezone);
  const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  const { period, position } = monthSummary(entries, settings, today.slice(0, 7), today);
  const lastEntry = entries.at(-1);

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      {shop.mode === "DEMO" && (
        <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">Demo data — a sample shop, not a real business</p>
      )}
      <h1 className="text-3xl font-bold">{shop.name}</h1>
      <p className="text-stone-600">Welcome, {shop.ownerName}</p>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Sales this month" value={formatNaira(period.revenueKobo)} />
        <Stat label="Cash collected" value={formatNaira(period.cashCollectedKobo)} />
        <Stat label="Owed to you" value={formatNaira(position.receivablesKobo)} />
        <Stat label="Overdue" value={formatNaira(position.overdueKobo)} />
        <Stat label="Cash on hand" value={formatNaira(position.cashOnHandKobo)} />
        <Stat
          label="Profit this month"
          value={period.netProfitKobo === null ? "Unavailable" : formatNaira(period.netProfitKobo)}
          note={period.netProfitKobo === null ? `${period.itemsWithoutCost.length} items have no cost price` : undefined}
        />
      </section>

      <p className="mt-6 text-sm text-stone-600">
        {entries.length} entries in the book{lastEntry ? `, latest on ${localDate(lastEntry.occurredAt, shop.timezone)}` : ""}. Month to {today}.
      </p>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-sm text-stone-600">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {note && <div className="mt-1 text-xs text-stone-600">{note}</div>}
    </div>
  );
}
