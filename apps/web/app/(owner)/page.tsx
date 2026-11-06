import { daySummary, entriesOn, formatNaira, promisesDueOn } from "@trustbook/ledger";
import Link from "next/link";
import { loadBook } from "../../src/lib/book";
import { EntryLine } from "../../src/ui/entry-line";
import { Section, shortDate, Stat } from "../../src/ui/kit";

/** Today: what came in, what went out on credit, and who promised to pay today. */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const book = await loadBook();
  const { entries, settings, today, debts } = book;
  const day = daySummary(entries, settings, today);
  const todays = entriesOn(entries, settings, today).reverse();
  const due = promisesDueOn(debts, today);

  return (
    <>
      {saved && (
        <p role="status" className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">
          {saved === "already" ? "That was already saved." : "Saved to your book."}
        </p>
      )}
      <h1 className="mt-1 text-3xl font-bold">Today</h1>
      <p className="text-stone-600">{shortDate(today)}</p>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Sales" value={formatNaira(day.revenueKobo)} note={`${day.salesCount} sale${day.salesCount === 1 ? "" : "s"}`} />
        <Stat label="Given on credit" value={formatNaira(day.creditGivenKobo)} />
        <Stat label="Money collected" value={formatNaira(day.cashCollectedKobo)} tone="good" />
        <Stat label="Spent" value={formatNaira(day.expensesKobo + day.purchasesKobo)} note="Stock and expenses" />
      </section>

      <Section title="Record something">
        <form action="/record" method="get" className="flex gap-2">
          <input
            name="text"
            required
            placeholder="Tunde collect 2 crates egg, 9k, he go pay Friday"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base"
          />
          <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white">
            Go
          </button>
        </form>
      </Section>

      <Section title="Promised for today">
        {due.length === 0 ? (
          <p className="text-stone-600">Nobody promised to pay today.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 shadow-sm">
            {due.map((d) => (
              <li key={d.saleId} className="flex justify-between border-b border-stone-100 py-3 last:border-0">
                <Link href={`/customers/${d.customerId}`} className="font-medium underline">
                  {book.customerName(d.customerId)}
                </Link>
                <span className={d.status === "paid" ? "text-emerald-800" : "text-amber-800"}>
                  {d.status === "paid" ? "Paid" : `${formatNaira(d.openKobo)} still owed`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Today's book" action={<Link href={`/day/${today}`} className="text-sm underline">See all</Link>}>
        {todays.length === 0 ? (
          <p className="text-stone-600">Nothing recorded yet today.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 shadow-sm">
            {todays.slice(0, 8).map((e) => (
              <EntryLine key={e.id} e={e} book={book} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
