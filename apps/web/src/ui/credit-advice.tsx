import { formatNaira } from "@trustbook/ledger";
import { adviceFor } from "../lib/advice";
import type { Book } from "../lib/book";
import { LabelBadge, shortDate } from "./kit";

/**
 * Credit advice for one customer (brief §6.3). The logic lives in lib/advice so the recovery
 * rehearsal checks exactly what the owner sees.
 */
export async function CreditAdvice({ book, customerId, amountKobo }: { book: Book; customerId: string; amountKobo?: number }) {
  const name = book.customerName(customerId);
  const a = await adviceFor({ shopId: book.shop.id, today: book.today, debts: book.debts, customerId, name, override: book.overrides[customerId] });
  const trust = { label: a.label, overridden: a.overridden, evidence: a.evidence, suggestedLimitKobo: a.suggestedLimitKobo };
  const balance = { owedKobo: a.owedKobo, overdueKobo: a.overdueKobo };
  const memories = a.memories ?? [];
  const recallError = a.memories === null;
  const overLimit = amountKobo !== undefined && trust.suggestedLimitKobo !== null && amountKobo > trust.suggestedLimitKobo;

  return (
    <section className={`mt-4 rounded-xl border p-4 ${trust.label === "Careful" ? "border-red-300 bg-red-50" : "border-stone-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">Advice for {name}</span>
        <LabelBadge label={trust.label} overridden={trust.overridden} />
      </div>
      <p className="mt-2 text-lg font-semibold">{a.advice}</p>
      <p className="mt-1 text-stone-700">
        {trust.evidence}. Owes {formatNaira(balance?.owedKobo ?? 0)}
        {balance.overdueKobo > 0 ? `, ${formatNaira(balance.overdueKobo)} overdue` : ""}.
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
