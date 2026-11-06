import { formatNaira, type ReplaceableEntry } from "@trustbook/ledger";
import type { Book } from "../lib/book";
import { timeOf } from "./kit";

/** One ledger entry in plain words, e.g. "Sale · Tunde · 2 × Eggs (crate) · ₦9,000 · ₦9,000 on credit". */
export function EntryLine({ e, book, showTime = true }: { e: ReplaceableEntry; book: Book; showTime?: boolean }) {
  const { title, detail, amount, tone } = describe(e, book);
  return (
    <li className="flex items-start justify-between gap-3 border-b border-stone-100 py-3 last:border-0">
      <div>
        <div className="font-medium">{title}</div>
        {detail && <div className="text-sm text-stone-600">{detail}</div>}
      </div>
      <div className="text-right">
        <div className={`font-semibold ${tone === "in" ? "text-emerald-800" : tone === "out" ? "text-red-700" : ""}`}>{amount}</div>
        {showTime && <div className="text-xs text-stone-500">{timeOf(e.occurredAt, book.shop.timezone)}</div>}
      </div>
    </li>
  );
}

function describe(e: ReplaceableEntry, book: Book): { title: string; detail?: string; amount: string; tone?: "in" | "out" } {
  switch (e.type) {
    case "SALE": {
      const credit = e.totalKobo - e.paidNowKobo;
      const items = e.items.map((i) => `${i.qty} × ${book.itemName(i.itemId)}`).join(", ");
      const who = e.customerId ? book.customerName(e.customerId) : "Cash sale";
      return {
        title: `Sale · ${who}`,
        detail: credit > 0 ? `${items} · ${formatNaira(credit)} on credit${e.promisedDate ? `, to pay by ${e.promisedDate}` : ""}` : items,
        amount: formatNaira(e.totalKobo),
        tone: "in",
      };
    }
    case "PAYMENT":
      return {
        title: `Payment · ${book.customerName(e.customerId)}`,
        detail: e.method === "sui" ? "Verified on Sui" : `${e.method === "cash" ? "Cash" : "Transfer"} · merchant-confirmed`,
        amount: formatNaira(e.amountKobo),
        tone: "in",
      };
    case "PURCHASE":
      return {
        title: `Stock bought${e.supplier ? ` · ${e.supplier}` : ""}`,
        detail: e.items.map((i) => `${i.qty} × ${book.itemName(i.itemId)}`).join(", ") + (e.paidNowKobo < e.totalKobo ? ` · ${formatNaira(e.totalKobo - e.paidNowKobo)} owed to supplier` : ""),
        amount: formatNaira(e.totalKobo),
        tone: "out",
      };
    case "EXPENSE":
      return { title: `Expense · ${e.category}`, detail: e.note || undefined, amount: formatNaira(e.amountKobo), tone: "out" };
    case "OWNER_IN":
      return { title: "Money added by owner", detail: e.note || undefined, amount: formatNaira(e.amountKobo), tone: "in" };
    case "OWNER_OUT":
      return { title: "Money taken by owner", detail: e.note || undefined, amount: formatNaira(e.amountKobo), tone: "out" };
    case "SUPPLIER_PAYMENT":
      return { title: `Paid supplier${e.supplier ? ` · ${e.supplier}` : ""}`, detail: e.note || undefined, amount: formatNaira(e.amountKobo), tone: "out" };
    case "STOCK_ADJUST":
      return { title: `Stock change · ${book.itemName(e.itemId)}`, detail: e.reason, amount: `${e.qtyDelta > 0 ? "+" : ""}${e.qtyDelta}` };
    case "PROMISE":
      return { title: `Promise · ${book.customerName(e.customerId)}`, detail: `Will pay by ${e.promisedDate}`, amount: "" };
  }
}
