import { addDays, customerRows, formatNaira, TRUST_LABELS, type TrustLabel } from "@trustbook/ledger";
import Link from "next/link";
import { loadBook } from "../../../src/lib/book";
import { LabelBadge } from "../../../src/ui/kit";

const SHOW = { all: "All", owing: "Owing", overdue: "Overdue", week: "Due this week" } as const;
type Show = keyof typeof SHOW;

/** Customers sorted by what they owe and how late they are, each with a rating and its reasons. Filters are plain links. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ show?: string; rating?: string }> }) {
  const sp = await searchParams;
  const show: Show = sp.show && sp.show in SHOW ? (sp.show as Show) : "all";
  const rating = (TRUST_LABELS as readonly string[]).includes(sp.rating ?? "") ? (sp.rating as TrustLabel) : undefined;
  const book = await loadBook();
  const all = customerRows(book.debts, book.customers.map((c) => c.id), book.overrides);
  const weekEnd = addDays(book.today, 7);
  const dueThisWeek = new Set(book.debts.debts.filter((d) => d.openKobo > 0 && d.dueDate >= book.today && d.dueDate <= weekEnd).map((d) => d.customerId));
  const rows = all.filter(
    (r) =>
      (show === "all" || (show === "owing" && r.owedKobo > 0) || (show === "overdue" && r.overdueKobo > 0) || (show === "week" && dueThisWeek.has(r.customerId))) &&
      (!rating || r.trust.label === rating),
  );
  const owed = all.reduce((s, r) => s + r.owedKobo, 0);
  const href = (next: { show?: Show; rating?: TrustLabel | null }) => {
    const q = new URLSearchParams();
    const s = next.show ?? show;
    const r = next.rating === null ? undefined : (next.rating ?? rating);
    if (s !== "all") q.set("show", s);
    if (r) q.set("rating", r);
    const str = q.toString();
    return str ? `/customers?${str}` : "/customers";
  };
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm ${active ? "border-emerald-800 bg-emerald-800 text-white" : "border-stone-300 bg-white text-stone-700"}`;

  return (
    <>
      <h1 className="mt-1 text-3xl">Credit Book</h1>
      <p className="text-stone-600">
        {all.length} customers · {formatNaira(owed)} owed to you
      </p>
      <nav aria-label="Filter by balance" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(SHOW) as Show[]).map((s) => (
          <Link key={s} href={href({ show: s })} className={chip(show === s)} aria-current={show === s ? "true" : undefined}>
            {SHOW[s]}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filter by rating" className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <Link href={href({ rating: null })} className={chip(!rating)}>
          Any rating
        </Link>
        {TRUST_LABELS.map((l) => (
          <Link key={l} href={href({ rating: l })} className={chip(rating === l)} aria-current={rating === l ? "true" : undefined}>
            {l}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-stone-200 bg-white p-4 text-stone-700">No customers match.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.customerId}>
              <Link href={`/customers/${r.customerId}`} className="block rounded-xl border border-stone-200 bg-white p-4">
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
      )}
    </>
  );
}
