"use server";

import { computeDebts, effectiveEntries, instantAt, localTime, parseNairaToKobo, proposeAllocations, TRUST_LABELS, validateEntry } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ulid } from "ulid";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../../../src/db/client";
import { loadBook } from "../../../../src/lib/book";
import { checkPin } from "../../../../src/lib/pin";
import { queueLabelOverride, queueMemoriesForSaved } from "../../../../src/memory/events";
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
  // A money action: the owner's PIN approves it (the demo shop has none).
  const pin = await checkPin(book.shop, String(formData.get("pin") ?? ""));
  if (pin !== "ok" && pin !== "not-needed") redirect(`/customers/${f.customerId}?error=pin-${pin}`);
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

const LabelForm = z.object({
  customerId: z.string().min(1),
  label: z.enum(["auto", ...TRUST_LABELS]),
  reason: z.string().trim().max(120).optional(),
});

/**
 * The owner overrides a customer's trust label, or hands it back to the rules (brief §6.2). Stored as
 * a DB flag and remembered on Walrus, so it survives a database wipe and shows in the advice.
 */
export async function setLabel(formData: FormData): Promise<void> {
  const book = await loadBook();
  const f = LabelForm.parse({ customerId: formData.get("customerId"), label: formData.get("label"), reason: formData.get("reason") || undefined });
  const customer = book.customers.find((c) => c.id === f.customerId);
  if (!customer) redirect("/customers");
  const label = f.label === "auto" ? null : f.label;
  if ((customer.labelOverride ?? null) === label) redirect(`/customers/${f.customerId}`);
  await db.update(schema.customers).set({ labelOverride: label }).where(and(eq(schema.customers.id, f.customerId), eq(schema.customers.shopId, book.shop.id)));
  await queueLabelOverride(book.shop, f.customerId, label, label ? f.reason : undefined);
  after(() => processOutbox().catch((err) => console.error("memory outbox:", err)));
  redirect(`/customers/${f.customerId}?label=1`);
}

const ContactForm = z.object({
  customerId: z.string().min(1),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s()-]/g, ""))
    .refine((s) => s === "" || /^\+?\d{10,15}$/.test(s), "Write the phone number like 08031234567 or +2348031234567"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((s) => s === "" || z.email().safeParse(s).success, "That email address does not look right"),
});

/** Saves a customer's phone (for WhatsApp reminders) and optional email (for automatic reminders). */
export async function updateContact(formData: FormData): Promise<void> {
  const book = await loadBook();
  const parsed = ContactForm.safeParse({ customerId: formData.get("customerId"), phone: String(formData.get("phone") ?? ""), email: String(formData.get("email") ?? "") });
  const id = String(formData.get("customerId") ?? "");
  if (!book.customers.some((c) => c.id === id)) redirect("/customers");
  if (!parsed.success) redirect(`/customers/${id}?contact=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  await db
    .update(schema.customers)
    .set({ phone: parsed.data.phone || null, email: parsed.data.email || null })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.shopId, book.shop.id)));
  redirect(`/customers/${id}?contact=saved`);
}

/**
 * Records a new promised pay date for everything the customer owes (a PROMISE entry, brief §6.1).
 * On that date the customer appears in Today's reminders, and is emailed if they have an email.
 */
export async function setPromise(formData: FormData): Promise<void> {
  const book = await loadBook();
  const id = String(formData.get("customerId") ?? "");
  if (!book.customers.some((c) => c.id === id)) redirect("/customers");
  const date = String(formData.get("promisedDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < book.today) redirect(`/customers/${id}?promise=bad`);
  if ((book.debts.balances.get(id)?.owedKobo ?? 0) === 0) redirect(`/customers/${id}?promise=nothing`);
  const now = instantAt(book.today, localTime(new Date().toISOString(), book.shop.timezone), book.shop.timezone);
  const entry = validateEntry({ id: ulid(), shopId: book.shop.id, occurredAt: now, recordedAt: now, source: "manual", confirmedBy: "owner", type: "PROMISE", customerId: id, promisedDate: date });
  await db.insert(schema.entries).values({ id: entry.id, shopId: entry.shopId, type: entry.type, occurredAt: new Date(entry.occurredAt), recordedAt: new Date(entry.recordedAt), customerId: id, data: entry });
  after(async () => {
    try {
      await queueMemoriesForSaved(book.shop, [entry]);
      await processOutbox();
    } catch (err) {
      console.error("memory outbox:", err instanceof Error ? err.message : err);
    }
  });
  redirect(`/customers/${id}?promise=saved`);
}
