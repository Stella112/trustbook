import { canonicalize, hashRecord, type DayRecord } from "@trustbook/ledger";

/**
 * What Trustbook stores on Walrus for Recovery Mode. A batch holds consecutive sealed day records
 * (about a week, never crossing a month) plus what is needed to rebuild the shop: its details and
 * the names behind customer and item ids. A month checkpoint holds the totals recovery must match.
 */
export interface ShopSnapshot {
  name: string;
  ownerName: string;
  timezone: string;
  openingCashKobo: number;
  defaultDueDays: number;
  suiAddress: string | null;
  mode: "DEMO" | "LIVE";
}

export interface BatchRecord {
  v: 1;
  kind: "batch";
  shopId: string;
  from: string;
  to: string;
  sealedAt: string;
  shop: ShopSnapshot;
  directory: { customers: Record<string, { name: string; phone: string | null }>; items: Record<string, { name: string; unit: string | null }> };
  days: DayRecord[];
}

export interface MonthTotals {
  revenueKobo: number;
  cashCollectedKobo: number;
  expensesKobo: number;
  purchasesKobo: number;
  salesCount: number;
}

export interface CheckpointRecord {
  v: 1;
  kind: "month";
  shopId: string;
  month: string;
  sealedAt: string;
  /** Hash of the last day record sealed in or before this month. */
  lastDayHash: string;
  /** Day records in the chain up to the end of this month. */
  dayCount: number;
  monthTotals: MonthTotals;
  /** Amount each customer owed at the end of the month. */
  customerBalances: Record<string, number>;
  /** Confirmed behaviour memories per namespace at seal time (brief §6.8a step 8). */
  behaviourCounts: Record<string, number>;
  hash: string;
}

export const batchHeader = (shopId: string, from: string, to: string) => `TRUSTBOOK-BATCH ${shopId} ${from} ${to}`;
export const monthHeader = (shopId: string, month: string) => `TRUSTBOOK-MONTH ${shopId} ${month}`;
export const ledgerNamespace = (shopId: string, month: string) => `trustbook:${shopId}:ledger:${month}`;

/** Text stored on Walrus: a fixed, searchable header line, then canonical JSON. */
export function encodeSealed(header: string, record: object): string {
  return `${header}\n${canonicalize(record)}`;
}

export type Sealed = { kind: "batch"; record: BatchRecord } | { kind: "month"; record: CheckpointRecord };

/** Parses stored text back, accepting it only when the header matches the content exactly. */
export function decodeSealed(text: string): Sealed | null {
  const nl = text.indexOf("\n");
  if (nl < 0) return null;
  const header = text.slice(0, nl);
  let body: { kind?: string; shopId?: string; from?: string; to?: string; month?: string };
  try {
    body = JSON.parse(text.slice(nl + 1));
  } catch {
    return null;
  }
  if (body.kind === "batch" && header === batchHeader(body.shopId!, body.from!, body.to!)) return { kind: "batch", record: body as BatchRecord };
  if (body.kind === "month" && header === monthHeader(body.shopId!, body.month!)) return { kind: "month", record: body as CheckpointRecord };
  return null;
}

export function sealCheckpoint(c: Omit<CheckpointRecord, "hash">): CheckpointRecord {
  return { ...c, hash: hashRecord(c) };
}

/** Sorts decoded blobs into batches and checkpoints for one shop; anything else is a problem. */
export function classifyBlobs(shopId: string, blobs: readonly { blobId: string; text: string }[]) {
  const batches: { record: BatchRecord; blobId: string }[] = [];
  const checkpoints: { record: CheckpointRecord; blobId: string }[] = [];
  const problems: string[] = [];
  for (const b of blobs) {
    const s = decodeSealed(b.text);
    if (!s) problems.push(`blob ${b.blobId} is not a Trustbook record`);
    else if (s.record.shopId !== shopId) problems.push(`blob ${b.blobId} belongs to shop ${s.record.shopId}`);
    else if (s.kind === "batch") batches.push({ record: s.record, blobId: b.blobId });
    else checkpoints.push({ record: s.record, blobId: b.blobId });
  }
  return { batches, checkpoints, problems };
}

/** A behaviour memory recovered from Walrus, with its real blob id. */
export interface RecoveredMemory {
  namespace: string;
  blobId: string;
  text: string;
}

/**
 * What the recovery tool writes to `ledger.json`: everything the importer needs to repopulate an
 * empty database. Day hashes are kept so sealing can continue the same chain after import.
 */
export interface RecoveredBooks {
  v: 1;
  shopId: string;
  recoveredAt: string;
  ok: boolean;
  anchorId: string | null;
  shop: ShopSnapshot;
  directory: BatchRecord["directory"];
  entries: DayRecord["entries"];
  days: { date: string; hash: string }[];
  batches: { blobId: string; namespace: string; from: string; to: string; sealedAt: string; dates: string[] }[];
  checkpoints: { blobId: string; namespace: string; record: CheckpointRecord }[];
}
