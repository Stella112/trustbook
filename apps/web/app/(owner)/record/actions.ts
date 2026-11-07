"use server";

import { validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, schema } from "../../../src/db/client";
import { readDraft } from "../../../src/lib/draft";
import { PIN_MESSAGES, checkPin } from "../../../src/lib/pin";
import { currentShop } from "../../../src/lib/shop";
import { queueBrokenPromises, queueMemoriesForSaved } from "../../../src/memory/events";
import { processOutbox } from "../../../src/memory/outbox";

export interface ConfirmState {
  error?: string;
}

/**
 * Saves a confirmed card: new customers and items, then the entries, in one transaction. A card that
 * records money received needs the owner's PIN (approved 6 Nov); a wrong PIN leaves the card on screen.
 */
export async function confirmDraft(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const shop = await currentShop();
  if (!shop) redirect("/login");
  const draft = readDraft(String(formData.get("draft") ?? ""));
  if (!draft || draft.shopId !== shop.id) redirect("/record?error=expired");
  // Re-check every entry, even though the card was signed: the ledger's rules are the last word.
  const entries = draft.entries.map((e) => validateEntry(e));
  if (entries.some((e) => e.shopId !== shop.id)) redirect("/record?error=expired");
  if (entries.some((e) => e.type === "PAYMENT")) {
    const pin = await checkPin(shop, String(formData.get("pin") ?? ""));
    if (pin !== "ok" && pin !== "not-needed") return { error: PIN_MESSAGES[pin] };
  }
  try {
    await db.transaction(async (tx) => {
      if (draft.newCustomers.length) await tx.insert(schema.customers).values(draft.newCustomers.map((c) => ({ id: c.id, shopId: shop.id, name: c.name, phone: c.phone ?? null })));
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
