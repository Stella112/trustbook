"use server";

import { validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, schema } from "../../../src/db/client";
import { readDraft } from "../../../src/lib/draft";
import { currentShop } from "../../../src/lib/shop";
import { queueBrokenPromises, queueMemoriesForSaved } from "../../../src/memory/events";
import { processOutbox } from "../../../src/memory/outbox";

/** Saves a confirmed card: new customers and items, then the entries, in one transaction. */
export async function confirmDraft(formData: FormData): Promise<void> {
  const shop = await currentShop();
  if (!shop) redirect("/login");
  const draft = readDraft(String(formData.get("draft") ?? ""));
  if (!draft || draft.shopId !== shop.id) redirect("/record?error=expired");
  // Re-check every entry, even though the card was signed: the ledger's rules are the last word.
  const entries = draft.entries.map((e) => validateEntry(e));
  if (entries.some((e) => e.shopId !== shop.id)) redirect("/record?error=expired");
  try {
    await db.transaction(async (tx) => {
      if (draft.newCustomers.length) await tx.insert(schema.customers).values(draft.newCustomers.map((c) => ({ id: c.id, shopId: shop.id, name: c.name })));
      if (draft.newItems.length) await tx.insert(schema.items).values(draft.newItems.map((i) => ({ id: i.id, shopId: shop.id, name: i.name })));
      if (entries.length)
        await tx.insert(schema.entries).values(
          entries.map((e) => ({
            id: e.id,
            shopId: e.shopId,
            type: e.type,
            occurredAt: new Date(e.occurredAt),
            recordedAt: new Date(e.recordedAt),
            customerId: "customerId" in e ? (e.customerId ?? null) : null,
            data: e,
          })),
        );
    });
  } catch (err) {
    // A second tap on Confirm hits the same ids; the first save already went through.
    if (String((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === "23505") redirect("/?saved=already");
    throw err;
  }
  // Memories are written after the owner's screen has moved on: a Walrus write takes 20–30 seconds.
  after(async () => {
    try {
      await queueMemoriesForSaved(shop, entries);
      await queueBrokenPromises(shop);
      await processOutbox();
    } catch (err) {
      console.error("memory outbox:", err instanceof Error ? err.message : err);
    }
  });
  redirect("/?saved=1");
}
