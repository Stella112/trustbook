import { formatNaira, supplierAccounts } from "@trustbook/ledger";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBook } from "../../../../src/lib/book";
import { PIN_MESSAGES, pinRequired } from "../../../../src/lib/pin";
import { shortDate, Stat } from "../../../../src/ui/kit";
import { paySupplier } from "./actions";

/** One supplier: bills, what is still open and when, payments, and a way to pay. */
export default async function SupplierPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ paid?: string; error?: string }> }) {
  const { key: raw } = await params;
  const { paid, error } = await searchParams;
  const key = decodeURIComponent(raw);
  const book = await loadBook();
  const a = supplierAccounts(book.entries, book.settings, book.today).find((x) => x.key === key);
  if (!a) notFound();
  const history = [
    ...a.bills.map((b) => ({ id: b.entryId, date: b.date, kind: "bill" as const, b })),
    ...a.payments.map((p) => ({ id: p.entryId, date: p.date, kind: "payment" as const, p })),
  ].sort((x, y) => (x.date < y.date ? 1 : -1));

  return (
    <div className="space-y-5 pt-1">
      <Link href="/suppliers" className="text-sm text-stone-600 underline">
        ← All suppliers
      </Link>
      <h1 className="text-3xl">{a.name}</h1>
      {paid && <p role="status" className="rounded-xl bg-emerald-100 px-4 py-3 font-semibold text-emerald-900">Payment saved. ✓</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="You owe" value={formatNaira(a.owedKobo)} tone={a.owedKobo > 0 ? "warn" : "good"} />
        <Stat label="Overdue" value={formatNaira(a.overdueKobo)} tone={a.overdueKobo > 0 ? "warn" : undefined} />
        <Stat label="Bought in total" value={formatNaira(a.purchasesKobo)} />
        <Stat label="Paid in total" value={formatNaira(a.paidKobo)} note={a.creditKobo > 0 ? `${formatNaira(a.creditKobo)} paid ahead` : undefined} />
      </section>

      {a.owedKobo > 0 && (
        <section className="rounded-3xl border border-stone-200 bg-white p-5">
          <h2 className="font-sans text-lg font-semibold tracking-normal">Pay {a.name}</h2>
          <p className="text-sm text-stone-600">Lowers what you owe. It is not counted as another purchase or an expense.</p>
          <form action={paySupplier} className="mt-3 space-y-3">
            <input type="hidden" name="key" value={a.key} />
            <input name="amount" required inputMode="decimal" placeholder={formatNaira(a.owedKobo).replace("₦", "")} aria-label="Amount paid" className="block w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
            <input name="note" maxLength={200} placeholder="Note or transfer reference (optional)" aria-label="Note" className="block w-full rounded-xl border border-stone-300 px-4 py-3" />
            {pinRequired(book.shop) && (
              <input name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" required placeholder="Your 6-number PIN" aria-label="Your 6-number PIN" className="block w-full rounded-xl border border-stone-300 px-4 py-3" />
            )}
            {error === "amount" && <p className="text-sm text-red-700">Write the amount like 20,000 or 20k.</p>}
            {error?.startsWith("pin-") && <p className="text-sm text-red-700">{PIN_MESSAGES[error.slice(4) as keyof typeof PIN_MESSAGES] ?? PIN_MESSAGES.wrong}</p>}
            <button type="submit" className="btn-primary w-full py-3">Save payment</button>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <h2 className="bg-stone-50 px-5 py-3 font-sans text-lg font-semibold tracking-normal">History</h2>
        <ul className="divide-y divide-stone-100">
          {history.map((h) =>
            h.kind === "bill" ? (
              <li key={h.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block font-semibold">Stock bought · {shortDate(h.date)}</span>
                  <span className="text-sm text-stone-600">
                    {h.b.openKobo > 0 ? `${formatNaira(h.b.openKobo)} still to pay` : "Paid in full"}
                    {h.b.dueDate && h.b.openKobo > 0 ? ` · due ${shortDate(h.b.dueDate)}` : ""}
                  </span>
                  {h.b.overdue && <span className="block text-xs font-semibold text-red-700">Overdue</span>}
                </span>
                <span className="font-semibold">{formatNaira(h.b.totalKobo)}</span>
              </li>
            ) : (
              <li key={h.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block font-semibold">Paid supplier · {shortDate(h.date)}</span>
                </span>
                <span className="font-semibold text-emerald-800">−{formatNaira(h.p.amountKobo)}</span>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
