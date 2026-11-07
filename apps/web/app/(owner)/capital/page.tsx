import { capitalReport, formatNaira, monthRange, monthSummary, productProfit } from "@trustbook/ledger";
import Link from "next/link";
import { loadBook } from "../../../src/lib/book";
import { PIN_MESSAGES, pinRequired } from "../../../src/lib/pin";
import { ChevronIcon } from "../../../src/ui/icons";
import { Stat } from "../../../src/ui/kit";
import { moveCapital } from "./actions";

const qty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, ""));

/**
 * Capital & Profit: has the money come back, has the shop made a profit, and how much can safely go
 * on new stock. Every number is from the ledger (packages/ledger capitalReport); none is estimated
 * except where labelled, and missing cost prices are shown, never guessed.
 */
export default async function CapitalPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const book = await loadBook();
  const r = capitalReport(book.entries, book.settings, book.today);
  const month = book.today.slice(0, 7);
  const m = monthSummary(book.entries, book.settings, month, book.today);
  const products = productProfit(book.entries, book.settings, monthRange(month).from, book.today).slice(0, 8);
  const pct = r.capitalInKobo > 0 ? Math.min(100, Math.round((r.recoveredKobo * 100) / r.capitalInKobo)) : 0;

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-3xl">Capital &amp; Profit</h1>
        <p className="text-stone-600">Have you got your money back, and what can you safely spend on stock?</p>
      </div>
      {saved && <p role="status" className="rounded-xl bg-emerald-100 px-4 py-3 font-semibold text-emerald-900">Saved. ✓</p>}

      {/* Capital recovery */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-600">Capital you put in</div>
        <div className="mt-1 font-display text-5xl leading-none">{formatNaira(r.capitalInKobo)}</div>
        <p className="mt-2 text-sm text-stone-600">
          Opening cash {formatNaira(r.openingKobo)}
          {r.addedKobo > 0 ? ` + added ${formatNaira(r.addedKobo)}` : ""}
          {r.withdrawnKobo > 0 ? ` − taken out ${formatNaira(r.withdrawnKobo)}` : ""}
        </p>
        <div className="mt-5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-emerald-800">Back in hand: {formatNaira(r.recoveredKobo)}</span>
            <span className="text-stone-600">{pct}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Capital back in hand">
            <div className="h-full rounded-full bg-emerald-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-stone-600">
            {r.toRecoverKobo > 0
              ? `${formatNaira(r.toRecoverKobo)} is still out: in stock on your shelves and in money customers owe. Unpaid credit is not counted as back.`
              : "All your capital is back as cash."}
          </p>
        </div>
      </section>

      {/* Safe to restock */}
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Safe to spend on new stock</div>
        <div className="mt-1 font-display text-4xl leading-none text-emerald-900">{formatNaira(r.safeToRestockKobo)}</div>
        <p className="mt-2 text-sm text-stone-700">
          Cash in hand {formatNaira(r.cashInHandKobo)} − owed to suppliers {formatNaira(r.supplierOwedKobo)}. Money customers still owe ({formatNaira(r.receivablesKobo)}) is left out
          until they pay.
        </p>
      </section>

      {/* Where the money is */}
      <section>
        <h2 className="mb-2 text-2xl">Where your money is now</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Cash in hand" value={formatNaira(r.cashInHandKobo)} note="Shop cash and Sui wallet" />
          <Stat label="Stock on shelves" value={formatNaira(r.stockValueKobo)} note={r.stockWarnings.length ? `${r.stockWarnings.length} item(s) without a cost price` : "At what you paid"} />
          <Stat label="Customers owe you" value={formatNaira(r.receivablesKobo)} />
          <Stat label="You owe suppliers" value={formatNaira(r.supplierOwedKobo)} tone={r.supplierOwedKobo > 0 ? "warn" : undefined} />
        </div>
      </section>

      {/* Profit */}
      <section>
        <h2 className="mb-2 text-2xl">Profit</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Sales, all time" value={formatNaira(r.revenueKobo)} />
          <Stat label="Profit after cost of goods" value={r.grossProfitKobo === null ? "Unavailable" : formatNaira(r.grossProfitKobo)} tone={r.grossProfitKobo === null ? undefined : "good"} />
          <Stat label="Profit after expenses" value={r.netProfitKobo === null ? "Unavailable" : formatNaira(r.netProfitKobo)} note={`Expenses ${formatNaira(r.expensesKobo)}`} />
          <Stat label="This month's profit" value={m.period.netProfitKobo === null ? "Unavailable" : formatNaira(m.period.netProfitKobo)} note="After expenses" />
        </div>
        {r.itemsWithoutCost.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Profit unavailable: {r.itemsWithoutCost.length} item{r.itemsWithoutCost.length === 1 ? " has" : "s have"} no cost price ({r.itemsWithoutCost.map((id) => book.itemName(id)).join(", ")}). Record what you paid for
            them, like “I buy 10 soap 5k from Iya Bose”, and profit will show.
          </p>
        )}
      </section>

      {/* Products */}
      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <h2 className="bg-stone-50 px-5 py-3 font-sans text-lg font-semibold tracking-normal">Best sellers this month</h2>
        {products.length === 0 ? (
          <p className="px-5 py-4 text-stone-700">No sales this month yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="px-5 py-2 font-medium">Product</th>
                <th className="px-2 py-2 text-right font-medium">Sold</th>
                <th className="px-2 py-2 text-right font-medium">Sales</th>
                <th className="px-5 py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.map((p) => (
                <tr key={p.itemId}>
                  <td className="px-5 py-2.5 font-medium">{book.itemName(p.itemId)}</td>
                  <td className="px-2 py-2.5 text-right">{qty(p.qtyMilli)}</td>
                  <td className="px-2 py-2.5 text-right">{formatNaira(p.revenueKobo)}</td>
                  <td className={`px-5 py-2.5 text-right font-semibold ${p.grossProfitKobo === null ? "text-stone-500" : "text-emerald-800"}`}>{p.grossProfitKobo === null ? "No cost" : formatNaira(p.grossProfitKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Owner money in / out */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5">
        <h2 className="font-sans text-lg font-semibold tracking-normal">Add capital or take money out</h2>
        <p className="text-sm text-stone-600">Money you put into the business, or take out for yourself. It changes your capital, not your sales.</p>
        <form action={moveCapital} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 px-3">
              <input type="radio" name="direction" value="in" defaultChecked className="h-5 w-5" /> I added money
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-stone-300 px-3">
              <input type="radio" name="direction" value="out" className="h-5 w-5" /> I took money out
            </label>
          </div>
          <input name="amount" required inputMode="decimal" placeholder="50,000" aria-label="Amount" className="block w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <input name="note" maxLength={200} placeholder="Note (optional)" aria-label="Note" className="block w-full rounded-xl border border-stone-300 px-4 py-3" />
          {pinRequired(book.shop) && (
            <input name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" required placeholder="Your 6-number PIN" aria-label="Your 6-number PIN" className="block w-full rounded-xl border border-stone-300 px-4 py-3" />
          )}
          {error === "amount" && <p className="text-sm text-red-700">Write the amount like 50,000 or 50k.</p>}
          {error?.startsWith("pin-") && <p className="text-sm text-red-700">{PIN_MESSAGES[error.slice(4) as keyof typeof PIN_MESSAGES] ?? PIN_MESSAGES.wrong}</p>}
          <button type="submit" className="btn-primary w-full py-3">Save</button>
        </form>
      </section>

      <Link href="/month" className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 font-medium">
        Monthly report and logbook <ChevronIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}
