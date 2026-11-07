import { daySummary, entriesOn, formatNaira, remindersDue } from "@trustbook/ledger";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema } from "../../src/db/client";
import { loadBook } from "../../src/lib/book";
import { appUrl, signPayLink, whatsappLink } from "../../src/lib/paylink";
import { reminderMessage } from "../../src/lib/reminder";
import { LessonTip } from "../../src/ui/lesson-tip";
import { EntryLine } from "../../src/ui/entry-line";
import { Section, shortDate, Stat } from "../../src/ui/kit";

/** Today: what came in, what went out on credit, and who promised to pay today. */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const book = await loadBook();
  const { entries, settings, today, debts } = book;
  const day = daySummary(entries, settings, today);
  const todays = entriesOn(entries, settings, today).reverse();
  // Reminders due: promised for today, or overdue. One tap opens WhatsApp on the owner's phone with
  // the message and a pay link; customers with an email are also reminded automatically each morning.
  const due = remindersDue(debts, today);
  const emailed = new Set(
    (await db.select({ customerId: schema.remindersSent.customerId }).from(schema.remindersSent).where(and(eq(schema.remindersSent.shopId, book.shop.id), eq(schema.remindersSent.date, today)))).map(
      (r) => r.customerId,
    ),
  );
  const reminders = due.map((r) => {
    const customer = book.customers.find((c) => c.id === r.customerId);
    const payUrl = `${appUrl()}/p/${signPayLink({ shopId: book.shop.id, customerId: r.customerId, amountKobo: r.owedKobo })}`;
    const message = reminderMessage({ customerName: customer?.name ?? "there", shopName: book.shop.name, due: r, payUrl });
    return { ...r, name: customer?.name ?? "Unknown customer", whatsapp: customer?.phone ? whatsappLink(customer.phone, message) : null, emailed: emailed.has(r.customerId) };
  });

  return (
    <>
      {saved && (
        <p role="status" className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">
          {saved === "already" ? "That was already saved." : "Saved to your book."}
        </p>
      )}
      <h1 className="mt-1 text-3xl">Today</h1>
      <p className="text-stone-600">{shortDate(today)}</p>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Sales" value={formatNaira(day.revenueKobo)} note={`${day.salesCount} sale${day.salesCount === 1 ? "" : "s"}`} />
        <Stat label="Given on credit" value={formatNaira(day.creditGivenKobo)} />
        <Stat label="Money collected" value={formatNaira(day.cashCollectedKobo)} tone="good" />
        <Stat label="Spent" value={formatNaira(day.expensesKobo + day.purchasesKobo)} note="Stock and expenses" />
      </section>

      {/* Streams in after the page: recall from Walrus takes a few seconds and must not hold up Today. */}
      <Suspense fallback={null}>
        <LessonTip book={book} />
      </Suspense>

      <Section title="Record something">
        <form action="/record" method="get" className="flex gap-2">
          <input
            name="text"
            required
            placeholder="Tunde collect 2 crates egg, 9k, he go pay Friday"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base"
          />
          <button type="submit" className="rounded-full bg-emerald-700 px-4 py-3 font-semibold text-white">
            Go
          </button>
        </form>
      </Section>

      <Section title={`Reminders due${reminders.length ? ` (${reminders.length})` : ""}`}>
        {reminders.length === 0 ? (
          <p className="text-stone-600">Nobody is due to pay today, and nobody is late.</p>
        ) : (
          <ul className="space-y-3">
            {reminders.map((r) => (
              <li key={r.customerId} className="rounded-xl bg-white p-4 border border-stone-200">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/customers/${r.customerId}`} className="text-lg font-semibold underline">
                    {r.name}
                  </Link>
                  <span className="text-right font-semibold">{formatNaira(r.dueTodayKobo + r.overdueKobo)}</span>
                </div>
                <p className={`text-sm ${r.dueTodayKobo > 0 ? "text-amber-800" : "text-red-700"}`}>
                  {r.dueTodayKobo > 0 ? "Promised to pay today" : `${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} late`}
                  {r.emailed ? " · reminded by email this morning" : ""}
                </p>
                {r.whatsapp ? (
                  <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-full bg-emerald-700 px-4 py-3 text-center font-semibold text-white">
                    Send reminder on WhatsApp
                  </a>
                ) : (
                  <Link href={`/customers/${r.customerId}#contact`} className="mt-2 block text-sm text-stone-600 underline">
                    Add {r.name}&apos;s phone number to remind them on WhatsApp
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Today's book" action={<Link href={`/day/${today}`} className="text-sm underline">See all</Link>}>
        {todays.length === 0 ? (
          <p className="text-stone-600">Nothing recorded yet today.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 border border-stone-200">
            {todays.slice(0, 8).map((e) => (
              <EntryLine key={e.id} e={e} book={book} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
