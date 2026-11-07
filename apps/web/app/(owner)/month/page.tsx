import { addDays, creditGiven, dayList, formatNaira, monthRange, monthSummary } from "@trustbook/ledger";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { db, schema } from "../../../src/db/client";
import { shopCodeOf } from "../../../src/lib/auth";
import { buildMonthLesson } from "../../../src/memory/lesson";
import { enqueue, processOutbox } from "../../../src/memory/outbox";
import { closeMonth } from "./actions";
import { loadBook } from "../../../src/lib/book";
import { Section, shortDate, Stat } from "../../../src/ui/kit";
import { BooksSecured } from "../../../src/ui/books-secured";
import { signOut } from "../actions";

/** This month: sales, profit (or why it is unavailable), credit, and a list of days to open. */
export default async function MonthPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const book = await loadBook();
  const { entries, settings, today, shop } = book;
  const { m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) && m <= today.slice(0, 7) ? m : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const until = to < today ? to : today;
  const { period, position } = monthSummary(entries, settings, month, today);
  const credit = creditGiven(entries, settings, from, until);
  const days = dayList(entries, settings, from, until);
  const prev = addDays(from, -1).slice(0, 7);
  const next = addDays(to, 1).slice(0, 7);
  const label = new Date(`${from}T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });

  // A month is closed once its lesson memory is queued. Opening a new month closes the last one
  // automatically (brief §6.7); the dedupe key keeps it to one lesson per month.
  const lessonFor = async (mm: string) =>
    (await db.select({ status: schema.outbox.status, blobId: schema.outbox.blobId }).from(schema.outbox).where(and(eq(schema.outbox.shopId, shop.id), eq(schema.outbox.dedupeKey, `lesson:${mm}`))))[0];
  const lastMonth = addDays(monthRange(today.slice(0, 7)).from, -1).slice(0, 7);
  const hasHistory = entries.some((e) => e.occurredAt.slice(0, 7) <= lastMonth);
  if (hasHistory && !(await lessonFor(lastMonth))) {
    const { event } = buildMonthLesson(entries, settings, lastMonth, shop.mode === "DEMO", book.customerName);
    await enqueue(shop.id, shop.mode === "DEMO", [event]);
    after(() => processOutbox().catch((err) => console.error("memory outbox:", err)));
  }
  const isPast = month < today.slice(0, 7);
  const lesson = isPast ? buildMonthLesson(entries, settings, month, shop.mode === "DEMO", book.customerName).text : null;
  const lessonRow = isPast ? await lessonFor(month) : undefined;

  return (
    <>
      <div className="mt-1 flex items-baseline justify-between">
        <h1 className="text-3xl">{label}</h1>
        <div className="flex gap-4 text-sm">
          <Link href={`/month?m=${prev}`} className="underline">
            ‹ Earlier
          </Link>
          {next <= today.slice(0, 7) && (
            <Link href={`/month?m=${next}`} className="underline">
              Later ›
            </Link>
          )}
        </div>
      </div>
      {until < to && <p className="text-stone-600">Up to today, {shortDate(today)}</p>}

      {lesson && (
        <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Lesson from {label}</div>
          <p className="mt-1">{lesson}</p>
          {lessonRow ? (
            <p className="mt-2 text-xs text-stone-600">
              {lessonRow.status === "confirmed" ? `Month closed · saved to Walrus, blob ${lessonRow.blobId?.slice(0, 10)}…` : "Month closed · saving to Walrus…"}
            </p>
          ) : (
            <form action={closeMonth} className="mt-3">
              <input type="hidden" name="month" value={month} />
              <button type="submit" className="rounded-full bg-emerald-700 px-4 py-2 font-semibold text-white">
                Close month and save the lesson
              </button>
            </form>
          )}
        </section>
      )}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Sales" value={formatNaira(period.revenueKobo)} note={`${period.salesCount} sales`} />
        <Stat
          label="Profit after expenses"
          value={period.netProfitKobo === null ? "Unavailable" : formatNaira(period.netProfitKobo)}
          note={period.netProfitKobo === null ? `${period.itemsWithoutCost.length} items have no cost price` : `Before expenses ${formatNaira(period.grossProfitKobo!)}`}
          tone={period.netProfitKobo !== null && period.netProfitKobo < 0 ? "warn" : undefined}
        />
        <Stat label="Money collected" value={formatNaira(period.cashCollectedKobo)} tone="good" />
        <Stat label="Stock bought" value={formatNaira(period.purchasesKobo)} note={`Expenses ${formatNaira(period.expensesKobo)}`} />
      </section>
      {period.itemsWithoutCost.length > 0 && (
        <p className="mt-2 text-sm text-stone-700">
          Profit unavailable: no cost price for {period.itemsWithoutCost.map((id) => book.itemName(id)).join(", ")}.
        </p>
      )}

      <Section title="Money on credit">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Given this month" value={formatNaira(credit)} />
          <Stat label="Owed to you now" value={formatNaira(position.receivablesKobo)} />
          <Stat label="Overdue" value={formatNaira(position.overdueKobo)} tone={position.overdueKobo > 0 ? "warn" : undefined} />
          <Stat label="You owe suppliers" value={formatNaira(position.supplierOwedKobo)} />
        </div>
      </Section>

      <Section title="Where you stand">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cash in the shop" value={formatNaira(position.cashOnHandKobo)} />
          <Stat label="In Sui wallet" value={formatNaira(position.suiWalletKobo)} />
          <Stat label="Stock value" value={formatNaira(position.stockValueKobo)} />
          <Stat label="Net position (estimate)" value={formatNaira(position.netPositionKobo)} note="Cash + wallet + stock + owed to you − owed to suppliers" />
        </div>
      </Section>

      <Section title="Day by day">
        {days.length === 0 ? (
          <p className="text-stone-600">No entries this month.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 border border-stone-200">
            {days.map((d) => (
              <li key={d.date} className="border-b border-stone-100 last:border-0">
                <Link href={`/day/${d.date}`} className="flex justify-between py-3">
                  <span className="font-medium">{shortDate(d.date)}</span>
                  <span>
                    {formatNaira(d.revenueKobo)} <span className="text-sm text-stone-500">sales</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Your records on Walrus">
        <Suspense fallback={<div className="rounded-xl bg-white p-4 text-stone-600 border border-stone-200">Checking storage…</div>}>
          <BooksSecured shopId={shop.id} timezone={shop.timezone} />
        </Suspense>
      </Section>

      <div className="mt-8 border-t border-stone-200 pt-4 text-sm text-stone-600">
        <a href="/api/export" className="flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 font-semibold text-stone-900" download>
          Download all records (CSV)
        </a>
        <p className="mt-1 text-xs">Every sale, payment and correction ever recorded, for Excel or Google Sheets.</p>
        {shop.mode === "LIVE" && (
          <p>
            Shop code <span className="font-mono font-semibold">{shopCodeOf(shop.id)}</span>
          </p>
        )}
        <form action={signOut}>
          <button type="submit" className="mt-2 underline">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
