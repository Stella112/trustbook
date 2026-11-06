import { customerRows, formatNaira } from "@trustbook/ledger";
import Link from "next/link";
import { loadBook } from "../../../src/lib/book";
import { LabelBadge } from "../../../src/ui/kit";

/** Customers sorted by what they owe and how late they are, each with a label and its reasons. */
export default async function CustomersPage() {
  const book = await loadBook();
  const rows = customerRows(book.debts, book.customers.map((c) => c.id), book.overrides);
  const owed = rows.reduce((s, r) => s + r.owedKobo, 0);
  return (
    <>
      <h1 className="mt-1 text-3xl font-bold">Customers</h1>
      <p className="text-stone-600">
        {rows.length} customers · {formatNaira(owed)} owed to you
      </p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.customerId}>
            <Link href={`/customers/${r.customerId}`} className="block rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{book.customerName(r.customerId)}</div>
                  <LabelBadge label={r.trust.label} overridden={r.trust.overridden} />
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{formatNaira(r.owedKobo)}</div>
                  {r.overdueKobo > 0 && <div className="text-sm text-red-700">{formatNaira(r.overdueKobo)} overdue</div>}
                </div>
              </div>
              <p className="mt-2 text-sm text-stone-600">{r.trust.evidence}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
