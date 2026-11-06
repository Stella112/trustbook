import {
  computeDebts,
  effectiveEntries,
  formatNaira,
  GENESIS,
  hashRecord,
  localDate,
  monthRange,
  summarizePeriod,
  verifyRecord,
  type DayRecord,
  type Entry,
  type ShopSettings,
} from "@trustbook/ledger";
import type { BatchRecord, CheckpointRecord, MonthTotals, ShopSnapshot } from "./records";

export interface AnchorReading {
  lastDay: string;
  headHash: string;
  dayCount: number;
  lastTxDigest: string | null;
}

export interface RecoveryInput {
  shopId: string;
  batches: { record: BatchRecord; blobId: string }[];
  checkpoints: { record: CheckpointRecord; blobId: string }[];
  /** null when no anchor could be read: completeness is then reported as SKIPPED, never PASS. */
  anchor: AnchorReading | null;
  anchorError?: string;
  /** Behaviour memories found per namespace, or null if not checked. */
  behaviourFound: Record<string, number> | null;
  /** Blobs that were found but could not be read or recognised: discovery then FAILs. */
  discoveryProblems?: string[];
}

export type StepStatus = "PASS" | "FAIL" | "SKIPPED";
export interface Step {
  name: string;
  status: StepStatus;
  detail: string;
  problems: string[];
}

export interface RecoveryResult {
  ok: boolean;
  steps: Step[];
  days: DayRecord[];
  entries: Entry[];
  shop: ShopSnapshot | null;
  directory: BatchRecord["directory"];
  balances: { customerId: string; name: string; owedKobo: number }[];
  adjustmentsAfterClose: { month: string; entryId: string; type: string; amountKobo: number; recordedAt: string }[];
}

const TOTAL_FIELDS: (keyof MonthTotals)[] = ["revenueKobo", "cashCollectedKobo", "expensesKobo", "purchasesKobo", "salesCount"];

/** The entries of a set of day records, oldest day first: the recovered ledger. */
export function rebuildLedger(days: readonly DayRecord[]): Entry[] {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).flatMap((d) => d.entries);
}

function settingsFor(shopId: string, shop: ShopSnapshot): ShopSettings {
  return { shopId, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
}

/** Month totals and balances as the shop knew them when a checkpoint was sealed. */
export function totalsAt(entries: readonly Entry[], settings: ShopSettings, month: string, sealedAt: string) {
  const known = entries.filter((e) => Date.parse(e.recordedAt) <= Date.parse(sealedAt));
  const { from, to } = monthRange(month);
  const p = summarizePeriod(known, settings, from, to);
  const totals: MonthTotals = { revenueKobo: p.revenueKobo, cashCollectedKobo: p.cashCollectedKobo, expensesKobo: p.expensesKobo, purchasesKobo: p.purchasesKobo, salesCount: p.salesCount };
  const debts = computeDebts(effectiveEntries(known), settings, to);
  const balances: Record<string, number> = {};
  for (const b of debts.balances.values()) if (b.owedKobo > 0) balances[b.customerId] = b.owedKobo;
  return { totals, balances };
}

/**
 * Proves the recovered books are unchanged, complete and reconciled (brief §6.8a steps 1–8).
 * Pure: the caller does all fetching. Every step reports PASS, FAIL or SKIPPED with its reason.
 */
export function verifyRecovery(input: RecoveryInput): RecoveryResult {
  const steps: Step[] = [];
  const step = (name: string, status: StepStatus, detail: string, problems: string[] = []) => steps.push({ name, status, detail, problems });

  // 1. Discovery
  const byDate = new Map<string, DayRecord>();
  const conflicts: string[] = [];
  for (const b of input.batches) {
    if (b.record.shopId !== input.shopId) continue;
    for (const d of b.record.days) {
      const seen = byDate.get(d.date);
      if (seen && seen.hash !== d.hash) conflicts.push(`${d.date} appears twice with different contents`);
      byDate.set(d.date, d);
    }
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const checkpoints = input.checkpoints.filter((c) => c.record.shopId === input.shopId).sort((a, b) => (a.record.month < b.record.month ? -1 : 1));
  step(
    "Records found",
    days.length && !conflicts.length && !input.discoveryProblems?.length ? "PASS" : "FAIL",
    `${days.length} day records in ${input.batches.length} Walrus blobs, ${checkpoints.length} monthly checkpoint${checkpoints.length === 1 ? "" : "s"}`,
    [...conflicts, ...(input.discoveryProblems ?? []), ...input.batches.map((b) => `batch ${b.record.from}..${b.record.to}: blob ${b.blobId}`), ...checkpoints.map((c) => `checkpoint ${c.record.month}: blob ${c.blobId}`)],
  );

  // 2. Anchor read through Tatum
  if (input.anchor) step("Anchor (Sui)", "PASS", `last day ${input.anchor.lastDay}, ${input.anchor.dayCount} days, tx ${input.anchor.lastTxDigest ?? "unknown"}`);
  else step("Anchor (Sui)", "SKIPPED", input.anchorError ?? "no anchor given");

  // 3. Record integrity
  const tampered = days.filter((d) => !verifyRecord(d)).map((d) => d.date);
  const badCheckpoints = checkpoints.filter((c) => hashRecord(c.record) !== c.record.hash).map((c) => c.record.month);
  step(
    "Fingerprints",
    tampered.length || badCheckpoints.length || conflicts.length ? "FAIL" : "PASS",
    `${days.length - tampered.length}/${days.length} day records match${checkpoints.length ? `, ${checkpoints.length - badCheckpoints.length}/${checkpoints.length} checkpoints match` : ""}`,
    [...tampered.map((d) => `day ${d} was changed`), ...badCheckpoints.map((m) => `checkpoint ${m} was changed`)],
  );

  // 4. Chain continuity from GENESIS
  const breaks: string[] = [];
  let expected = GENESIS;
  let previous = "the start";
  for (const d of days) {
    if (d.prevHash !== expected) breaks.push(`missing day record(s) after ${previous} and before ${d.date}`);
    expected = d.hash;
    previous = d.date;
  }
  const newest = days.at(-1);
  step("Chain", breaks.length || !newest ? "FAIL" : "PASS", newest ? (breaks.length ? `broken in ${breaks.length} place${breaks.length === 1 ? "" : "s"}` : `unbroken GENESIS → ${newest.date}`) : "no records", breaks);

  // 5. Completeness against the Sui anchor
  if (!input.anchor) step("Complete vs anchor", "SKIPPED", "anchor not read, so dropped newest days cannot be ruled out");
  else if (!newest) step("Complete vs anchor", "FAIL", `Anchor says ${input.anchor.dayCount} days up to ${input.anchor.lastDay}; found none.`);
  else {
    const ok = newest.hash === input.anchor.headHash && days.length === input.anchor.dayCount;
    step(
      "Complete vs anchor",
      ok ? "PASS" : "FAIL",
      ok ? `${days.length} = ${input.anchor.dayCount}, head hash matches` : `Anchor says ${input.anchor.dayCount} days up to ${input.anchor.lastDay}; found ${days.length} up to ${newest.date}.`,
    );
  }

  // 6. Totals against sealed monthly checkpoints
  const latestBatch = [...input.batches].sort((a, b) => (a.record.sealedAt < b.record.sealedAt ? -1 : 1)).at(-1)?.record;
  const shop = latestBatch?.shop ?? null;
  const directory: BatchRecord["directory"] = { customers: {}, items: {} };
  for (const b of input.batches) {
    Object.assign(directory.customers, b.record.directory.customers);
    Object.assign(directory.items, b.record.directory.items);
  }
  const entries = rebuildLedger(days);
  const settings = shop ? settingsFor(input.shopId, shop) : null;
  const totalProblems: string[] = [];
  const adjustments: RecoveryResult["adjustmentsAfterClose"] = [];
  if (!settings || !checkpoints.length) step("Totals", "SKIPPED", !settings ? "no shop details recovered" : "no monthly checkpoints sealed yet");
  else {
    for (const c of checkpoints) {
      const { totals } = totalsAt(entries, settings, c.record.month, c.record.sealedAt);
      for (const f of TOTAL_FIELDS) {
        const diff = totals[f] - c.record.monthTotals[f];
        if (diff !== 0) totalProblems.push(`${c.record.month} ${f}: rebuilt ${f === "salesCount" ? totals[f] : formatNaira(totals[f])}, sealed ${f === "salesCount" ? c.record.monthTotals[f] : formatNaira(c.record.monthTotals[f])} (difference ${f === "salesCount" ? diff : `${diff} kobo`})`);
      }
      const { from, to } = monthRange(c.record.month);
      for (const e of entries) {
        const d = localDate(e.occurredAt, settings.timezone);
        if (d >= from && d <= to && Date.parse(e.recordedAt) > Date.parse(c.record.sealedAt)) {
          const amount = "totalKobo" in e ? e.totalKobo : "amountKobo" in e ? e.amountKobo : 0;
          adjustments.push({ month: c.record.month, entryId: e.id, type: e.type, amountKobo: amount, recordedAt: e.recordedAt });
        }
      }
    }
    step(
      "Totals",
      totalProblems.length ? "FAIL" : "PASS",
      totalProblems.length ? `${totalProblems.length} difference${totalProblems.length === 1 ? "" : "s"}` : `${checkpoints.map((c) => c.record.month).join(", ")} match sealed checkpoints (0 kobo diff)${adjustments.length ? `; ${adjustments.length} adjustment(s) after close listed separately` : ""}`,
      totalProblems,
    );
  }

  // 7. Customer balances against the latest checkpoint
  const latest = checkpoints.at(-1)?.record;
  const balanceProblems: string[] = [];
  if (!settings || !latest) step("Balances", "SKIPPED", "no checkpoint to compare against");
  else {
    const { balances } = totalsAt(entries, settings, latest.month, latest.sealedAt);
    const ids = new Set([...Object.keys(balances), ...Object.keys(latest.customerBalances)]);
    for (const id of ids) {
      const rebuilt = balances[id] ?? 0;
      const sealed = latest.customerBalances[id] ?? 0;
      if (rebuilt !== sealed) balanceProblems.push(`${directory.customers[id]?.name ?? id}: rebuilt ${formatNaira(rebuilt)}, sealed ${formatNaira(sealed)}`);
    }
    const owed = Object.values(latest.customerBalances).reduce((s, x) => s + x, 0);
    step("Balances", balanceProblems.length ? "FAIL" : "PASS", `${ids.size} customers, ${formatNaira(owed)} owed at ${latest.month} close${balanceProblems.length ? "" : ", all match"}`, balanceProblems);
  }

  // 8. Behaviour memory recovered
  if (!input.behaviourFound || !latest) step("Behaviour memory", "SKIPPED", !latest ? "no checkpoint lists memory counts" : "memory not checked");
  else {
    const missing: string[] = [];
    let expectedTotal = 0;
    let found = 0;
    for (const [ns, n] of Object.entries(latest.behaviourCounts)) {
      expectedTotal += n;
      const got = input.behaviourFound[ns] ?? 0;
      found += Math.min(got, n);
      if (got < n) missing.push(`${ns}: found ${got}, sealed ${n}`);
    }
    const newer = Object.entries(input.behaviourFound).reduce((s, [ns, n]) => s + Math.max(0, n - (latest.behaviourCounts[ns] ?? 0)), 0);
    step("Behaviour memory", missing.length ? "FAIL" : "PASS", `${found}/${expectedTotal} memories restored${newer ? `, ${newer} newer than last seal` : ""}`, missing);
  }

  // Current balances from everything recovered.
  const balances: RecoveryResult["balances"] = [];
  if (settings && newest) {
    const debts = computeDebts(effectiveEntries(entries), settings, newest.date);
    for (const b of debts.balances.values()) if (b.owedKobo > 0) balances.push({ customerId: b.customerId, name: directory.customers[b.customerId]?.name ?? b.customerId, owedKobo: b.owedKobo });
    balances.sort((a, b) => b.owedKobo - a.owedKobo);
  }

  return { ok: steps.every((s) => s.status !== "FAIL"), steps, days, entries, shop, directory, balances, adjustmentsAfterClose: adjustments };
}

/** The plain-text report (brief §6.8a). Every number comes from the run; skipped steps say so. */
export function formatReport(r: RecoveryResult, shopName: string, runAt: string): string {
  const lines = [`TRUSTBOOK RECOVERY REPORT — ${shopName} — run ${runAt}`];
  for (const s of r.steps) {
    const label = `${s.name} `.padEnd(21, ".");
    const status = s.status === "SKIPPED" ? `SKIPPED` : s.status;
    lines.push(`${label} ${s.detail}`.padEnd(72) + ` ${status}`);
    for (const p of s.status === "PASS" ? [] : s.problems) lines.push(`    - ${p}`);
  }
  lines.push(r.ok ? (r.steps.some((s) => s.status === "SKIPPED") ? "RESULT: NO FAILURES (SOME CHECKS SKIPPED)" : "RESULT: BOOKS COMPLETE AND UNCHANGED") : "RESULT: PROBLEMS FOUND");
  if (r.adjustmentsAfterClose.length) {
    lines.push("", "Adjustments after close (not failures):");
    for (const a of r.adjustmentsAfterClose) lines.push(`    ${a.month}: ${a.type} ${a.entryId} ${formatNaira(a.amountKobo)} recorded ${a.recordedAt}`);
  }
  if (r.balances.length) {
    lines.push("", "Who owes what (rebuilt):");
    for (const b of r.balances) lines.push(`    ${b.name.padEnd(16)} ${formatNaira(b.owedKobo)}`);
  }
  return lines.join("\n");
}
