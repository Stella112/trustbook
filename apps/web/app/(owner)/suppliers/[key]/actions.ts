"use server";

import { instantAt, localTime, parseNairaToKobo, supplierAccounts, validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../../../src/db/client";
import { loadBook } from "../../../../src/lib/book";
import { checkPin } from "../../../../src/lib/pin";

const Form = z.object({ key: z.string().min(1).max(200), amount: z.string().min(1).max(30), note: z.string().max(200) });

/**
 * Pays money the shop owes a supplier. It lowers that supplier's balance; it is not a new purchase or
 * an expense. A money action, so the owner's PIN approves it.
 */
export async function paySupplier(formData: FormData): Promise<void> {
  const book = await loadBook();
  const f = Form.parse({ key: formData.get("key"), amount: formData.get("amount"), note: formData.get("note") ?? "" });
  const back = `/suppliers/${encodeURIComponent(f.key)}`;
  const account = supplierAccounts(book.entries, book.settings, book.today).find((a) => a.key === f.key);
  if (!account) redirect("/suppliers");
  const kobo = parseNairaToKobo(f.amount);
  if (!kobo) redirect(`${back}?error=amount`);
  const pin = await checkPin(book.shop, String(formData.get("pin") ?? ""));
  if (pin !== "ok" && pin !== "not-needed") redirect(`${back}?error=pin-${pin}`);
  const now = instantAt(book.today, localTime(new Date().toISOString(), book.shop.timezone), book.shop.timezone);
  const entry = validateEntry({
    id: ulid(),
    shopId: book.shop.id,
    occurredAt: now,
    recordedAt: now,
    source: "manual",
    confirmedBy: "owner",
    type: "SUPPLIER_PAYMENT",
    supplier: account.name,
    amountKobo: kobo,
    note: f.note.trim(),
  });
  await db.insert(schema.entries).values({ id: entry.id, shopId: entry.shopId, type: entry.type, occurredAt: new Date(entry.occurredAt), recordedAt: new Date(entry.recordedAt), customerId: null, data: entry });
  redirect(`${back}?paid=1`);
}
