import { computeDebts, effectiveEntries, localDate, validateEntry, type ShopSettings, type TrustLabel } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "../db/client";
import { currentShop } from "./shop";

type Shop = typeof schema.shops.$inferSelect;

/**
 * A shop's validated ledger, customers and items, and the debts computed from them. Used by the app
 * (for the signed-in shop) and by the Telegram bot (for the shop linked to a chat).
 */
export async function bookForShop(shop: Shop) {
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
}

/**
 * Everything an owner screen needs, for the signed-in shop. Cached per request so a page and its
 * layout share one database read.
 */
export const loadBook = cache(async () => {
  const shop = await currentShop();
  // Signed-out visitors on an app screen are asked to sign in.
  if (!shop) redirect("/login");
  return bookForShop(shop);
});

export type Book = Awaited<ReturnType<typeof bookForShop>>;
