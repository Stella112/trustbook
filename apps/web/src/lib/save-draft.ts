import { validateEntry, type Entry } from "@trustbook/ledger";
import { db, schema } from "../db/client";
import type { SignedDraft } from "./draft";

type Shop = typeof schema.shops.$inferSelect;

/**
 * Saves a confirmed card in one transaction: new customers and items, then the entries. Shared by the
 * app's Confirm button and Telegram's, so both save exactly the same way. Every entry is re-checked
 * against the ledger's rules even though the card was signed. Returns "already" when the same card
 * was saved before (its entry ids already exist).
 */
export async function saveDraft(shop: Shop, draft: SignedDraft): Promise<{ entries: Entry[]; already: boolean }> {
  if (draft.shopId !== shop.id) throw new Error("card belongs to another shop");
  const entries = draft.entries.map((e) => validateEntry(e));
  if (entries.some((e) => e.shopId !== shop.id)) throw new Error("card belongs to another shop");
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
    if (String((err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code) === "23505") return { entries, already: true };
    throw err;
  }
  return { entries, already: false };
}
