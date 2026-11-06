import { formatNaira, trustLabel } from "@trustbook/ledger";
import { parseMemory, recallMemories, recallNamespaces } from "@trustbook/memory";
import type { Book } from "../lib/book";
import { LabelBadge, shortDate } from "./kit";

const ADVICE: Record<string, string> = {
  Careful: "Be careful giving more credit.",
  "Sometimes late": "Credit is okay in small amounts.",
  "Good payer": "Safe to give credit.",
  New: "Not enough history yet. Start small.",
};

/**
 * Credit advice for one customer (brief §6.3): the label, numbers and limit come from the ledger;
 * the quotes are recalled from Walrus Memory and filtered to this customer.
 */
export async function CreditAdvice({ book, customerId, amountKobo }: { book: Book; customerId: string; amountKobo?: number }) {
  const name = book.customerName(customerId);
  const trust = trustLabel(book.debts, customerId, book.overrides[customerId]);
  const balance = book.debts.balances.get(customerId);
  let memories: { summary: string; occurredAt: string; blobId: string; demo?: boolean }[] = [];
  let recallError = false;
  try {
    const recalled = await recallMemories(`${name} credit payment late promise`, recallNamespaces(book.shop.id, book.today), 10);
    // Warning signs first: a broken promise or late payment says more than a routine credit sale.
    const weight = (kind: string, summary: string) => (kind === "promise_broken" ? 0 : kind === "payment" && /after the promised/.test(summary) ? 1 : kind === "label_change" ? 2 : 3);
    memories = recalled
      .map((r) => ({ r, m: parseMemory(r.text) }))
      .filter((x) => x.m?.customerId === customerId)
      .slice(0, 6)
      .sort((a, b) => weight(a.m!.kind, a.m!.summary) - weight(b.m!.kind, b.m!.summary))
      .slice(0, 3)
      .map(({ r, m }) => ({ summary: m!.summary, occurredAt: m!.occurredAt, blobId: r.blobId, demo: m!.demo }));
  } catch {
    recallError = true;
  }
  const overLimit = amountKobo !== undefined && trust.suggestedLimitKobo !== null && amountKobo > trust.suggestedLimitKobo;

  return (
    <section className={`mt-4 rounded-xl border p-4 ${trust.label === "Careful" ? "border-red-300 bg-red-50" : "border-stone-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">Advice for {name}</span>
        <LabelBadge label={trust.label} overridden={trust.overridden} />
      </div>
      <p className="mt-2 text-lg font-semibold">{ADVICE[trust.label]}</p>
      <p className="mt-1 text-stone-700">
        {trust.evidence}. Owes {formatNaira(balance?.owedKobo ?? 0)}
        {(balance?.overdueKobo ?? 0) > 0 ? `, ${formatNaira(balance!.overdueKobo)} overdue` : ""}.
      </p>
      {trust.suggestedLimitKobo !== null && (
        <p className={`mt-1 ${overLimit ? "font-semibold text-red-800" : "text-stone-700"}`}>
          Suggested limit {formatNaira(trust.suggestedLimitKobo)}
          {overLimit ? ` — this credit of ${formatNaira(amountKobo!)} is above it.` : "."}
        </p>
      )}
      <div className="mt-3 border-t border-stone-200 pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Remembered on Walrus</div>
        {recallError ? (
          <p className="text-sm text-stone-600">Memory is not reachable right now; advice uses the book only.</p>
        ) : memories.length === 0 ? (
          <p className="text-sm text-stone-600">No memories about {name} yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {memories.map((m) => (
              <li key={m.blobId}>
                “{m.summary}” <span className="text-stone-500">· {shortDate(m.occurredAt.slice(0, 10))}{m.demo ? " · demo" : ""} · blob {m.blobId.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function AdviceLoading() {
  return <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4 text-stone-600">Checking what we remember…</section>;
}
