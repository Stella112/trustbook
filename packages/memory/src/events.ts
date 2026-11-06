import {
  computeDebts,
  daysBetween,
  effectiveEntries,
  formatNaira,
  instantAt,
  localDate,
  trustLabel,
  type Entry,
  type ShopSettings,
  type TrustLabel,
} from "@trustbook/ledger";

/**
 * Behaviour memories (brief §6.3). Pure: decides WHAT to remember from ledger changes; the outbox
 * and the Walrus client decide how and when it is written.
 */
export type MemoryKind = "credit" | "payment" | "promise_made" | "promise_kept" | "promise_broken" | "label_change" | "label_override" | "month_lesson";

export interface MemoryEvent {
  kind: MemoryKind;
  customerId?: string;
  /** Business time of the event, kept in the content because the relayer stamps write time (brief §4.1). */
  occurredAt: string;
  /** Prevents writing the same memory twice, e.g. "payment:<entryId>". */
  dedupeKey: string;
  /** The memory content: compact JSON including a one-line human summary. */
  content: string;
  namespace: string;
}

export const behaviourNamespace = (shopId: string, month: string) => `trustbook:${shopId}:behaviour:${month}`;

/** The current month and the two before it, newest first, for recall (brief §6.3). */
export function recallNamespaces(shopId: string, today: string): string[] {
  const out: string[] = [];
  let [y, m] = today.slice(0, 7).split("-").map(Number) as [number, number];
  for (let i = 0; i < 3; i++) {
    out.push(behaviourNamespace(shopId, `${y}-${String(m).padStart(2, "0")}`));
    m -= 1;
    if (m === 0) [y, m] = [y - 1, 12];
  }
  return out;
}

interface Ctx {
  shopId: string;
  settings: ShopSettings;
  today: string;
  demo: boolean;
  customerName: (id: string) => string;
}

function make(ctx: Ctx, kind: MemoryKind, occurredAt: string, dedupeKey: string, fields: Record<string, unknown>, summary: string, customerId?: string): MemoryEvent {
  const body = { v: 1, kind, shopId: ctx.shopId, customerId, customerName: customerId ? ctx.customerName(customerId) : undefined, occurredAt, ...fields, ...(ctx.demo ? { demo: true } : {}), summary };
  return {
    kind,
    customerId,
    occurredAt,
    dedupeKey,
    content: JSON.stringify(body),
    namespace: behaviourNamespace(ctx.shopId, localDate(occurredAt, ctx.settings.timezone).slice(0, 7)),
  };
}

/**
 * Memories caused by newly confirmed entries: credit given, payments (with days early or late),
 * promises made, promises kept, and trust-label changes.
 */
export function eventsForNewEntries(before: readonly Entry[], added: readonly Entry[], ctx: Ctx): MemoryEvent[] {
  const after = [...before, ...added];
  const debtsBefore = computeDebts(effectiveEntries(before), ctx.settings, ctx.today);
  const debtsAfter = computeDebts(effectiveEntries(after), ctx.settings, ctx.today);
  const out: MemoryEvent[] = [];
  const touched = new Set<string>();

  for (const e of added) {
    if (e.type === "SALE" && e.customerId && e.totalKobo > e.paidNowKobo) {
      touched.add(e.customerId);
      const credit = e.totalKobo - e.paidNowKobo;
      const name = ctx.customerName(e.customerId);
      out.push(
        make(ctx, "credit", e.occurredAt, `credit:${e.id}`, { amountKobo: credit, promisedDate: e.promisedDate }, `${name} took ${formatNaira(credit)} on credit${e.promisedDate ? `, promising to pay by ${e.promisedDate}` : ""}.`, e.customerId),
      );
    }
    if (e.type === "PAYMENT") {
      touched.add(e.customerId);
      const paidOn = localDate(e.occurredAt, ctx.settings.timezone);
      const settled = debtsAfter.debts.filter((d) => d.customerId === e.customerId && d.settledDate === paidOn && debtsBefore.debts.find((b) => b.saleId === d.saleId)?.openKobo !== 0);
      const due = settled.map((d) => d.dueDate).sort()[0];
      const daysLate = due ? daysBetween(due, paidOn) : null;
      const timing = daysLate === null ? "" : daysLate > 0 ? `, ${daysLate} day${daysLate === 1 ? "" : "s"} after the promised date` : daysLate < 0 ? `, ${-daysLate} day${daysLate === -1 ? "" : "s"} early` : ", on the promised date";
      const name = ctx.customerName(e.customerId);
      out.push(make(ctx, "payment", e.occurredAt, `payment:${e.id}`, { amountKobo: e.amountKobo, method: e.method, daysLate }, `${name} paid ${formatNaira(e.amountKobo)}${e.method === "sui" ? " on Sui" : ""}${timing}.`, e.customerId));
    }
    if (e.type === "PROMISE") {
      touched.add(e.customerId);
      out.push(make(ctx, "promise_made", e.occurredAt, `promise:${e.id}`, { promisedDate: e.promisedDate }, `${ctx.customerName(e.customerId)} promised to pay by ${e.promisedDate}.`, e.customerId));
    }
  }

  // Promises newly kept by these entries.
  const keptBefore = new Set(debtsBefore.promises.filter((p) => p.kept).map(promiseKey));
  for (const p of debtsAfter.promises) {
    if (!p.kept || keptBefore.has(promiseKey(p)) || !touched.has(p.customerId)) continue;
    const when = added.find((e) => e.type === "PAYMENT" && e.customerId === p.customerId)?.occurredAt ?? added[0]!.occurredAt;
    out.push(make(ctx, "promise_kept", when, `kept:${promiseKey(p)}`, { promisedDate: p.promisedDate }, `${ctx.customerName(p.customerId)} kept the promise to pay by ${p.promisedDate}.`, p.customerId));
  }

  // Trust labels that changed because of these entries.
  for (const id of touched) {
    const was = trustLabel(debtsBefore, id);
    const now = trustLabel(debtsAfter, id);
    if (was.label === now.label) continue;
    const when = added[added.length - 1]!.occurredAt;
    out.push(labelChange(ctx, id, was.label, now.label, now.evidence, when, `label:${id}:${added[0]!.id}`));
  }
  return out;
}

function labelChange(ctx: Ctx, customerId: string, from: TrustLabel, to: TrustLabel, evidence: string, occurredAt: string, dedupeKey: string): MemoryEvent {
  return make(ctx, "label_change", occurredAt, dedupeKey, { from, to, evidence }, `${ctx.customerName(customerId)} changed from ${from} to ${to}: ${evidence}.`, customerId);
}

const promiseKey = (p: { customerId: string; saleIds: string[]; promisedDate: string; madeOn: string }) => `${p.customerId}:${p.saleIds.join("+")}:${p.promisedDate}:${p.madeOn}`;

/** Promises whose date has passed unpaid. The dedupe key stops each being written more than once. */
export function brokenPromiseEvents(entries: readonly Entry[], ctx: Ctx): MemoryEvent[] {
  const debts = computeDebts(effectiveEntries(entries), ctx.settings, ctx.today);
  return debts.promises
    .filter((p) => !p.kept && p.promisedDate < ctx.today)
    .map((p) => make(ctx, "promise_broken", instantAt(p.promisedDate, "23:59", ctx.settings.timezone), `broken:${promiseKey(p)}`, { promisedDate: p.promisedDate }, `${ctx.customerName(p.customerId)} broke the promise to pay by ${p.promisedDate}.`, p.customerId));
}

/** The owner overriding a label (brief §6.2). */
export function labelOverrideEvent(ctx: Ctx, customerId: string, label: TrustLabel, occurredAt: string): MemoryEvent {
  return make(ctx, "label_override", occurredAt, `override:${customerId}:${occurredAt}`, { label }, `The owner set ${ctx.customerName(customerId)}'s label to ${label}.`, customerId);
}

/** A closed month's lesson (brief §6.7). Text is built from computed numbers, never by a model. */
export function monthLessonEvent(ctx: Ctx, month: string, summary: string, fields: Record<string, unknown>, occurredAt: string): MemoryEvent {
  const e = make(ctx, "month_lesson", occurredAt, `lesson:${month}`, { month, ...fields }, summary);
  return { ...e, namespace: behaviourNamespace(ctx.shopId, month) };
}

/** Reads a memory's JSON content back, or null if it is not one of ours. */
export function parseMemory(text: string): { kind: MemoryKind; customerId?: string; occurredAt: string; summary: string; demo?: boolean } | null {
  try {
    const j = JSON.parse(text) as { v?: number; kind?: MemoryKind; customerId?: string; occurredAt?: string; summary?: string; demo?: boolean };
    return j.v === 1 && j.kind && j.occurredAt && j.summary ? { kind: j.kind, customerId: j.customerId, occurredAt: j.occurredAt, summary: j.summary, demo: j.demo } : null;
  } catch {
    return null;
  }
}
