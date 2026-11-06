import type { Entry } from "./types";

/** Kobo as plain naira text with two decimals, e.g. 450050 → "4500.50". Integer maths only. */
export function koboToNairaText(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Quotes a CSV field when it holds a comma, quote or line break (RFC 4180). */
function field(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  "date",
  "time",
  "type",
  "customer",
  "amount_naira",
  "paid_now_naira",
  "on_credit_naira",
  "method",
  "details",
  "verified_on_sui",
  "entry_id",
  "recorded_at",
  "source",
  "reversed_by",
] as const;

interface Names {
  timezone: string;
  customerName: (id: string) => string;
  itemName: (id: string) => string;
}

function localParts(instant: string, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function row(e: Entry, n: Names, reversedBy: string | undefined): (string | number | undefined)[] {
  const { date, time } = localParts(e.occurredAt, n.timezone);
  const customer = "customerId" in e && e.customerId ? n.customerName(e.customerId) : "";
  let amount: number | undefined;
  let paidNow: number | undefined;
  let credit: number | undefined;
  let method = "";
  let details = "";
  let digest = "";
  switch (e.type) {
    case "SALE":
      amount = e.totalKobo;
      paidNow = e.paidNowKobo;
      credit = e.totalKobo - e.paidNowKobo;
      details = e.items.map((i) => `${i.qty} x ${n.itemName(i.itemId)} @ ${koboToNairaText(i.unitPriceKobo)}`).join("; ") + (e.promisedDate ? `; promised by ${e.promisedDate}` : "");
      break;
    case "PAYMENT":
      amount = e.amountKobo;
      method = e.method;
      digest = e.verification?.digest ?? "";
      details = e.verification ? `${e.verification.amountMinor} minor units of ${e.verification.coinType.split("::").at(-1)} at ${e.verification.rateUsed}` : "merchant-confirmed";
      break;
    case "PURCHASE":
      amount = e.totalKobo;
      paidNow = e.paidNowKobo;
      details = e.items.map((i) => `${i.qty} x ${n.itemName(i.itemId)} @ ${koboToNairaText(i.unitCostKobo)}`).join("; ") + (e.supplier ? `; from ${e.supplier}` : "");
      break;
    case "EXPENSE":
      amount = e.amountKobo;
      details = [e.category, e.note].filter(Boolean).join(": ");
      break;
    case "OWNER_IN":
    case "OWNER_OUT":
    case "SUPPLIER_PAYMENT":
      amount = e.amountKobo;
      details = [e.type === "SUPPLIER_PAYMENT" ? e.supplier : undefined, e.note].filter(Boolean).join(": ");
      break;
    case "STOCK_ADJUST":
      details = `${e.qtyDelta > 0 ? "+" : ""}${e.qtyDelta} ${n.itemName(e.itemId)}: ${e.reason}`;
      break;
    case "PROMISE":
      details = `promised by ${e.promisedDate}`;
      break;
    case "CORRECTION":
      details = `reverses ${e.targetEntryId}: ${e.reason}${e.replacement ? ` (replaced by a corrected ${e.replacement.type})` : ""}`;
      break;
  }
  const money = (k: number | undefined) => (k === undefined ? "" : koboToNairaText(k));
  return [date, time, e.type, customer, money(amount), money(paidNow), money(credit), method, details, digest, e.id, e.recordedAt, e.source, reversedBy];
}

/**
 * The whole ledger as CSV (brief P1 "CSV export"), one row per entry in the order recorded,
 * corrections included. Nothing is netted or hidden: a reversed entry stays, with the id of the
 * correction that reversed it, so the file is a faithful copy of the append-only book.
 */
export function ledgerCsv(entries: readonly Entry[], names: Names): string {
  const reversedBy = new Map<string, string>();
  for (const e of entries) if (e.type === "CORRECTION") reversedBy.set(e.targetEntryId, e.id);
  const sorted = [...entries].sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id < b.id ? -1 : 1));
  const lines = [CSV_COLUMNS.join(","), ...sorted.map((e) => row(e, names, reversedBy.get(e.id)).map(field).join(","))];
  return lines.join("\r\n") + "\r\n";
}
