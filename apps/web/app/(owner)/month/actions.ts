"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadBook } from "../../../src/lib/book";
import { buildMonthLesson } from "../../../src/memory/lesson";
import { enqueue, processOutbox } from "../../../src/memory/outbox";

/** Closes a finished month: queues its lesson memory for Walrus (written once, by dedupe key). */
export async function closeMonth(formData: FormData): Promise<void> {
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
  const book = await loadBook();
  if (month >= book.today.slice(0, 7)) redirect(`/month?m=${month}`);
  const { event } = buildMonthLesson(book.entries, book.settings, month, book.shop.mode === "DEMO", book.customerName);
  await enqueue(book.shop.id, book.shop.mode === "DEMO", [event]);
  after(() => processOutbox().catch((err) => console.error("memory outbox:", err)));
  redirect(`/month?m=${month}&closed=1`);
}
