import { brokenPromiseEvents, eventsForNewEntries, labelOverrideEvent } from "@trustbook/memory";
import type { TrustLabel } from "@trustbook/ledger";
import { localDate, validateEntry, type Entry } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { enqueue } from "./outbox";

type Shop = typeof schema.shops.$inferSelect;

async function shopContext(shop: Shop) {
  const [rows, customers] = await Promise.all([
    db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt)),
    db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.shopId, shop.id)),
  ]);
  const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  return {
    entries: rows.map((r) => validateEntry(r.data)),
    ctx: {
      shopId: shop.id,
      settings,
      today: localDate(new Date().toISOString(), shop.timezone),
      demo: shop.mode === "DEMO",
      customerName: (id: string) => customers.find((c) => c.id === id)?.name ?? "a customer",
    },
  };
}

/** Queues behaviour memories for entries that were just saved. Call after the save commits. */
export async function queueMemoriesForSaved(shop: Shop, saved: Entry[]): Promise<number> {
  const { entries, ctx } = await shopContext(shop);
  const ids = new Set(saved.map((e) => e.id));
  const before = entries.filter((e) => !ids.has(e.id));
  return enqueue(shop.id, ctx.demo, eventsForNewEntries(before, saved, ctx));
}

/** Queues a memory for each promise whose date has passed unpaid; repeats are ignored by dedupe key. */
export async function queueBrokenPromises(shop: Shop): Promise<number> {
  const { entries, ctx } = await shopContext(shop);
  return enqueue(shop.id, ctx.demo, brokenPromiseEvents(entries, ctx));
}

/** Remembers the owner setting (or clearing, with `null`) a customer's label (brief §6.2). */
export async function queueLabelOverride(shop: Shop, customerId: string, label: TrustLabel | null, reason?: string): Promise<number> {
  const { ctx } = await shopContext(shop);
  return enqueue(shop.id, ctx.demo, [labelOverrideEvent(ctx, customerId, label, new Date().toISOString(), reason)]);
}
