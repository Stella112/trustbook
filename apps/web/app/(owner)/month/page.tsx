import { addDays, creditGiven, dayList, formatNaira, monthRange, monthSummary } from "@trustbook/ledger";
import Link from "next/link";
import { shopCodeOf } from "../../../src/lib/auth";
import { loadBook } from "../../../src/lib/book";
import { Section, shortDate, Stat } from "../../../src/ui/kit";
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

  return (
    <>
      <div className="mt-1 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">{label}</h1>
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
          <ul className="rounded-xl bg-white px-4 shadow-sm">
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

      <div className="mt-8 border-t border-stone-200 pt-4 text-sm text-stone-600">
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
