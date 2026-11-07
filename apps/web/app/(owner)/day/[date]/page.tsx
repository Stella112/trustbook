import { addDays, daySummary, entriesOn, formatNaira } from "@trustbook/ledger";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBook } from "../../../../src/lib/book";
import { EntryLine } from "../../../../src/ui/entry-line";
import { Section, shortDate, Stat } from "../../../../src/ui/kit";

/** One day's full book. */
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  const book = await loadBook();
  const s = daySummary(book.entries, book.settings, date);
  const list = entriesOn(book.entries, book.settings, date);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <>
      <div className="mt-1 flex items-baseline justify-between">
        <h1 className="text-3xl">{shortDate(date)}</h1>
        <div className="flex gap-4 text-sm">
          <Link href={`/day/${prev}`} className="underline">
            ‹ Day before
          </Link>
          {next <= book.today && (
            <Link href={`/day/${next}`} className="underline">
              Next day ›
            </Link>
          )}
        </div>
      </div>
      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Sales" value={formatNaira(s.revenueKobo)} note={`${s.salesCount} sales`} />
        <Stat label="Given on credit" value={formatNaira(s.creditGivenKobo)} />
        <Stat label="Money collected" value={formatNaira(s.cashCollectedKobo)} tone="good" />
        <Stat label="Spent" value={formatNaira(s.expensesKobo + s.purchasesKobo)} note="Stock and expenses" />
      </section>
      <Section title={`${list.length} entr${list.length === 1 ? "y" : "ies"}`}>
        {list.length === 0 ? (
          <p className="text-stone-600">Nothing was recorded on this day.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 border border-stone-200">
            {list.map((e) => (
              <EntryLine key={e.id} e={e} book={book} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
