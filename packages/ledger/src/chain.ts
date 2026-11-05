import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { localDate } from "./dates.js";
import type { Entry } from "./types.js";

export const GENESIS = "GENESIS";

export interface DayTotals {
  entryCount: number;
  salesKobo: number;
  /** Cash in from sales paid now plus payments received. */
  cashInKobo: number;
  purchasesKobo: number;
  expensesKobo: number;
}

export interface DayRecord {
  v: 1;
  shopId: string;
  /** The business date the record covers, shop-local. */
  date: string;
  /** When the record was actually sealed. Seeded demo days are sealed later than their date. */
  sealedAt: string;
  demo: boolean;
  entries: Entry[];
  dayTotals: DayTotals;
  /** Confirmed behaviour memories per customer at seal time. */
  behaviourCounts: Record<string, number>;
  prevHash: string;
  hash: string;
}

/**
 * Deterministic JSON: object keys sorted, no whitespace. Keys whose value is undefined are dropped,
 * as JSON.stringify does. Non-finite numbers and undefined array items are rejected, since they
 * would not survive a round trip.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonicalize: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((v) => {
        if (v === undefined) throw new Error("canonicalize: undefined array item");
        return canonicalize(v);
      })
      .join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  throw new Error(`canonicalize: unsupported ${typeof value}`);
}

/** SHA-256 (hex) of the canonical JSON of a record, excluding its own `hash` field. */
export function hashRecord(record: object): string {
  const { hash: _ignored, ...rest } = record as Record<string, unknown>;
  return bytesToHex(sha256(utf8ToBytes(canonicalize(rest))));
}

export function verifyRecord(record: { hash: string }): boolean {
  return hashRecord(record) === record.hash;
}

export function dayTotals(entries: readonly Entry[]): DayTotals {
  const t: DayTotals = { entryCount: entries.length, salesKobo: 0, cashInKobo: 0, purchasesKobo: 0, expensesKobo: 0 };
  for (const e of entries) {
    if (e.type === "SALE") {
      t.salesKobo += e.totalKobo;
      t.cashInKobo += e.paidNowKobo;
    } else if (e.type === "PAYMENT") t.cashInKobo += e.amountKobo;
    else if (e.type === "PURCHASE") t.purchasesKobo += e.totalKobo;
    else if (e.type === "EXPENSE") t.expensesKobo += e.amountKobo;
  }
  return t;
}

/**
 * Entries that belong in a day's record: those recorded on that shop-local date.
 * A correction to an earlier day is recorded today, so it lands in today's record; old records never change.
 */
export function entriesRecordedOn(entries: readonly Entry[], date: string, timezone: string): Entry[] {
  return entries
    .filter((e) => localDate(e.recordedAt, timezone) === date)
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || (a.id < b.id ? -1 : 1));
}

export function buildDayRecord(input: {
  shopId: string;
  date: string;
  sealedAt: string;
  demo: boolean;
  entries: Entry[];
  behaviourCounts?: Record<string, number>;
  prevHash: string;
}): DayRecord {
  const body = {
    v: 1 as const,
    shopId: input.shopId,
    date: input.date,
    sealedAt: input.sealedAt,
    demo: input.demo,
    entries: input.entries,
    dayTotals: dayTotals(input.entries),
    behaviourCounts: input.behaviourCounts ?? {},
    prevHash: input.prevHash,
  };
  return { ...body, hash: hashRecord(body) };
}

export interface ChainCheck {
  ok: boolean;
  /** Dates whose stored hash does not match their content. */
  tampered: string[];
  /** Dates whose prevHash does not point at the record before them. */
  breaks: string[];
  headHash: string;
  dayCount: number;
}

/** Checks each record's hash and that prevHash links run unbroken from GENESIS, oldest date first. */
export function verifyChain(records: readonly DayRecord[]): ChainCheck {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const tampered: string[] = [];
  const breaks: string[] = [];
  let expected = GENESIS;
  for (const r of sorted) {
    if (!verifyRecord(r)) tampered.push(r.date);
    if (r.prevHash !== expected) breaks.push(r.date);
    expected = r.hash;
  }
  return { ok: !tampered.length && !breaks.length, tampered, breaks, headHash: expected, dayCount: sorted.length };
}
