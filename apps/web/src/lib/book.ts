import { computeDebts, effectiveEntries, localDate, validateEntry, type ShopSettings, type TrustLabel } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "../db/client";
import { currentShop } from "./shop";

/**
 * Everything an owner screen needs: the signed-in shop, its validated ledger, customers and items.
 * Cached per request so a page and its layout share one database read.
 */
export const loadBook = cache(async () => {
  const shop = await currentShop();
  if (!shop) redirect("/login");
  const [rows, customers, items] = await Promise.all([
    db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt)),
    db.select().from(schema.customers).where(eq(schema.customers.shopId, shop.id)).orderBy(asc(schema.customers.name)),
    db.select().from(schema.items).where(eq(schema.items.shopId, shop.id)).orderBy(asc(schema.items.name)),
  ]);
  const entries = rows.map((r) => validateEntry(r.data));
  const settings: ShopSettings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  const today = localDate(new Date().toISOString(), shop.timezone);
  const debts = computeDebts(effectiveEntries(entries), settings, today);
  const overrides = Object.fromEntries(customers.map((c) => [c.id, (c.labelOverride ?? undefined) as TrustLabel | undefined]));
  return {
    shop,
    entries,
    settings,
    today,
    debts,
    overrides,
    customers,
    items,
    customerName: (id: string | undefined) => customers.find((c) => c.id === id)?.name ?? "Unknown customer",
    itemName: (id: string) => items.find((i) => i.id === id)?.name ?? id,
  };
});

export type Book = Awaited<ReturnType<typeof loadBook>>;
