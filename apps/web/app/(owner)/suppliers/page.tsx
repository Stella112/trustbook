import { formatNaira, supplierAccounts, supplierSummary } from "@trustbook/ledger";
import Link from "next/link";
import { loadBook } from "../../../src/lib/book";
import { ChevronIcon, TruckIcon } from "../../../src/ui/icons";
import { shortDate, Stat } from "../../../src/ui/kit";

/** Suppliers: who the shop owes, what is due soon or late. All from the ledger. */
export default async function SuppliersPage() {
  const book = await loadBook();
  const accounts = supplierAccounts(book.entries, book.settings, book.today);
  const s = supplierSummary(accounts, book.today);
  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-3xl">Suppliers</h1>
        <p className="text-stone-600">Who you owe for stock, and when it is due.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="You owe suppliers" value={formatNaira(s.owedKobo)} tone={s.owedKobo > 0 ? "warn" : undefined} />
        <Stat label="Suppliers owed" value={String(s.suppliersOwed)} />
        <Stat label="Overdue" value={formatNaira(s.overdueKobo)} tone={s.overdueKobo > 0 ? "warn" : undefined} />
        <Stat label="Due this week" value={formatNaira(s.dueSoon.reduce((t, b) => t + b.openKobo, 0))} note={`${s.dueSoon.length} bill${s.dueSoon.length === 1 ? "" : "s"}`} />
      </section>

      {(s.overdue.length > 0 || s.dueSoon.length > 0) && (
        <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
          <h2 className="bg-[#fdf3e7] px-5 py-3 font-sans text-lg font-semibold tracking-normal">To pay soon</h2>
          <ul className="divide-y divide-stone-100">
            {[...s.overdue, ...s.dueSoon].map((b) => (
              <li key={b.entryId} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block font-semibold">{b.supplier}</span>
                  <span className={`text-sm ${b.overdue ? "text-red-700" : "text-amber-800"}`}>
                    {b.overdue ? "Overdue since" : "Due"} {shortDate(b.dueDate!)}
                  </span>
                </span>
                <span className="font-semibold">{formatNaira(b.openKobo)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between bg-stone-50 px-5 py-3">
          <h2 className="font-sans text-lg font-semibold tracking-normal">All suppliers</h2>
          <Link href="/record" className="text-sm font-medium text-emerald-800 underline">
            Record a purchase
          </Link>
        </div>
        {accounts.length === 0 ? (
          <p className="px-5 py-5 text-stone-700">
            No suppliers yet. Record stock you buy, for example: <span className="italic">“I buy 10 crates egg 38k from Alhaji, I go pay Friday”</span>.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {accounts.map((a) => (
              <li key={a.key}>
                <Link href={`/suppliers/${encodeURIComponent(a.key)}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-800">
                    <TruckIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block truncate text-sm text-stone-600">
                      Bought {formatNaira(a.purchasesKobo)} · paid {formatNaira(a.paidKobo)}
                      {a.nextDueDate ? ` · next due ${shortDate(a.nextDueDate)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block font-semibold ${a.owedKobo > 0 ? "" : "text-emerald-800"}`}>{a.owedKobo > 0 ? formatNaira(a.owedKobo) : "Settled"}</span>
                    {a.overdueKobo > 0 && <span className="text-xs font-semibold text-red-700">{formatNaira(a.overdueKobo)} late</span>}
                  </span>
                  <ChevronIcon className="h-5 w-5 shrink-0 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
