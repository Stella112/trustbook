"use server";

import { computeDebts, effectiveEntries, instantAt, localTime, parseNairaToKobo, proposeAllocations, validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../../../src/db/client";
import { loadBook } from "../../../../src/lib/book";
import { queueMemoriesForSaved } from "../../../../src/memory/events";
import { processOutbox } from "../../../../src/memory/outbox";

const Form = z.object({
  customerId: z.string().min(1),
  amount: z.string().min(1),
  method: z.enum(["cash", "transfer"]),
});

/** "Mark as paid" for cash or bank transfer: merchant-confirmed, allocated oldest-first (brief §5 item 9). */
export async function markAsPaid(formData: FormData): Promise<void> {
  const book = await loadBook();
  const f = Form.parse({ customerId: formData.get("customerId"), amount: formData.get("amount"), method: formData.get("method") });
  if (!book.customers.some((c) => c.id === f.customerId)) redirect("/customers");
  const kobo = parseNairaToKobo(f.amount);
  if (!kobo) redirect(`/customers/${f.customerId}?error=amount`);
  const now = instantAt(book.today, localTime(new Date().toISOString(), book.shop.timezone), book.shop.timezone);
  const debts = computeDebts(effectiveEntries(book.entries), book.settings, book.today);
  const entry = validateEntry({
    id: ulid(),
    shopId: book.shop.id,
    occurredAt: now,
    recordedAt: now,
    source: "manual",
    confirmedBy: "owner",
    type: "PAYMENT",
    customerId: f.customerId,
    amountKobo: kobo,
    method: f.method,
    allocations: proposeAllocations(debts, f.customerId, kobo),
  });
  await db.insert(schema.entries).values({ id: entry.id, shopId: entry.shopId, type: entry.type, occurredAt: new Date(entry.occurredAt), recordedAt: new Date(entry.recordedAt), customerId: f.customerId, data: entry });
  after(async () => {
    try {
      await queueMemoriesForSaved(book.shop, [entry]);
      await processOutbox();
    } catch (err) {
      console.error("memory outbox:", err instanceof Error ? err.message : err);
    }
  });
  redirect(`/customers/${f.customerId}?paid=1`);
}
