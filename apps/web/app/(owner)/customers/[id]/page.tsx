import { customerHistory, formatNaira, trustLabel } from "@trustbook/ledger";
import { notFound } from "next/navigation";
import { loadBook } from "../../../../src/lib/book";
import { EntryLine } from "../../../../src/ui/entry-line";
import { LabelBadge, Section, shortDate, Stat } from "../../../../src/ui/kit";

/** One customer: what they owe, how they pay, and their full history. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await loadBook();
  const customer = book.customers.find((c) => c.id === id);
  if (!customer) notFound();
  const balance = book.debts.balances.get(id);
  const trust = trustLabel(book.debts, id, book.overrides[id]);
  const open = book.debts.debts.filter((d) => d.customerId === id && d.openKobo > 0);
  const history = customerHistory(book.entries, id);

  return (
    <>
      <h1 className="mt-1 text-3xl font-bold">{customer.name}</h1>
      <div className="mt-1">
        <LabelBadge label={trust.label} overridden={trust.overridden} />
      </div>
      <p className="mt-2 text-stone-700">{trust.evidence}</p>
      {trust.suggestedLimitKobo !== null && (
        <p className="mt-1 text-stone-700">
          Suggested credit limit: <strong>{formatNaira(trust.suggestedLimitKobo)}</strong>
          <span className="text-sm text-stone-500"> (the middle of what they usually repay in full)</span>
        </p>
      )}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Owes you" value={formatNaira(balance?.owedKobo ?? 0)} />
        <Stat label="Overdue" value={formatNaira(balance?.overdueKobo ?? 0)} tone={(balance?.overdueKobo ?? 0) > 0 ? "warn" : undefined} />
      </section>
      {(balance?.creditKobo ?? 0) > 0 && <p className="mt-2 text-sm text-emerald-800">Holds {formatNaira(balance!.creditKobo)} credit from paying extra.</p>}

      <Section title="Unpaid debts">
        {open.length === 0 ? (
          <p className="text-stone-600">Nothing owed.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 shadow-sm">
            {open.map((d) => (
              <li key={d.saleId} className="flex justify-between border-b border-stone-100 py-3 last:border-0">
                <span>
                  {shortDate(d.saleDate)} <span className="text-sm text-stone-500">· due {shortDate(d.dueDate)}</span>
                </span>
                <span className={d.dueDate < book.today ? "font-semibold text-red-700" : "font-semibold"}>{formatNaira(d.openKobo)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History">
        <ul className="rounded-xl bg-white px-4 shadow-sm">
          {history.map((e) => (
            <EntryLine key={e.id} e={e} book={book} showTime={false} />
          ))}
        </ul>
      </Section>
    </>
  );
}
