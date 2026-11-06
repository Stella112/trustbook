import { trustLabel, type DebtState, type TrustLabel } from "@trustbook/ledger";
import { parseMemory, recallMemories, recallNamespaces } from "@trustbook/memory";

export const ADVICE: Record<TrustLabel, string> = {
  Careful: "Be careful giving more credit.",
  "Sometimes late": "Credit is okay in small amounts.",
  "Good payer": "Safe to give credit.",
  New: "Not enough history yet. Start small.",
};

export interface Advice {
  customerId: string;
  name: string;
  label: TrustLabel;
  overridden: boolean;
  advice: string;
  evidence: string;
  owedKobo: number;
  overdueKobo: number;
  suggestedLimitKobo: number | null;
  /** Quotes recalled from Walrus Memory, or null when memory could not be reached. */
  memories: { summary: string; occurredAt: string; blobId: string; demo?: boolean }[] | null;
}

/**
 * Credit advice for one customer (brief §6.3): label, numbers and limit come from the ledger; the
 * quotes are recalled from Walrus Memory and filtered to this customer. Shared by the advice card
 * and scripts/rehearse-recovery.ts, so the rehearsal checks exactly what the owner sees.
 */
export async function adviceFor(input: { shopId: string; today: string; debts: DebtState; customerId: string; name: string; override?: TrustLabel }): Promise<Advice> {
  const trust = trustLabel(input.debts, input.customerId, input.override);
  const balance = input.debts.balances.get(input.customerId);
  let memories: Advice["memories"] = [];
  try {
    const recalled = await recallMemories(`${input.name} credit payment late promise`, recallNamespaces(input.shopId, input.today), 10);
    // Warning signs first: a broken promise or late payment says more than a routine credit sale.
    const weight = (kind: string, summary: string) => (kind === "promise_broken" ? 0 : kind === "payment" && /after the promised/.test(summary) ? 1 : kind === "label_change" ? 2 : 3);
    memories = recalled
      .map((r) => ({ r, m: parseMemory(r.text) }))
      // occurredAt carries the shop's offset, so its first 10 characters are the shop-local date.
      // Memories after `today` are ignored so quotes never run ahead of the numbers.
      .filter((x) => x.m?.customerId === input.customerId && x.m.occurredAt.slice(0, 10) <= input.today)
      .slice(0, 6)
      .sort((a, b) => weight(a.m!.kind, a.m!.summary) - weight(b.m!.kind, b.m!.summary))
      .slice(0, 3)
      .map(({ r, m }) => ({ summary: m!.summary, occurredAt: m!.occurredAt, blobId: r.blobId, demo: m!.demo }));
  } catch {
    memories = null;
  }
  return {
    customerId: input.customerId,
    name: input.name,
    label: trust.label,
    overridden: trust.overridden,
    advice: ADVICE[trust.label],
    evidence: trust.evidence,
    owedKobo: balance?.owedKobo ?? 0,
    overdueKobo: balance?.overdueKobo ?? 0,
    suggestedLimitKobo: trust.suggestedLimitKobo,
    memories,
  };
}
