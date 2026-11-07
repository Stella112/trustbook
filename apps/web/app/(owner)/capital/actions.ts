"use server";

import { instantAt, localTime, parseNairaToKobo, validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../../src/db/client";
import { loadBook } from "../../../src/lib/book";
import { checkPin } from "../../../src/lib/pin";

const Form = z.object({ direction: z.enum(["in", "out"]), amount: z.string().min(1).max(30), note: z.string().max(200) });

/** Money the owner puts into the business (capital) or takes out. A money action: the PIN approves it. */
export async function moveCapital(formData: FormData): Promise<void> {
  const book = await loadBook();
  const f = Form.parse({ direction: formData.get("direction"), amount: formData.get("amount"), note: formData.get("note") ?? "" });
  const kobo = parseNairaToKobo(f.amount);
  if (!kobo) redirect("/capital?error=amount");
  const pin = await checkPin(book.shop, String(formData.get("pin") ?? ""));
  if (pin !== "ok" && pin !== "not-needed") redirect(`/capital?error=pin-${pin}`);
  const now = instantAt(book.today, localTime(new Date().toISOString(), book.shop.timezone), book.shop.timezone);
  const entry = validateEntry({
    id: ulid(),
    shopId: book.shop.id,
    occurredAt: now,
    recordedAt: now,
    source: "manual",
    confirmedBy: "owner",
    type: f.direction === "in" ? "OWNER_IN" : "OWNER_OUT",
    amountKobo: kobo,
    note: f.note.trim(),
  });
  await db.insert(schema.entries).values({ id: entry.id, shopId: entry.shopId, type: entry.type, occurredAt: new Date(entry.occurredAt), recordedAt: new Date(entry.recordedAt), customerId: null, data: entry });
  redirect("/capital?saved=1");
}
