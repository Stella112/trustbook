import {
  capitalReport,
  customerRows,
  monthRange,
  parseNairaToKobo,
  productProfit,
  supplierAccounts,
  supplierSummary,
  daySummary,
  formatNaira,
  lastPayment,
  localDate,
  resolveDate,
  resolvePeriod,
  summarizePeriod,
  topDebtors,
  trustLabel,
  type DebtState,
  type Entry,
  type ShopSettings,
} from "@trustbook/ledger";
import { z } from "zod";
import { matchName, type Known } from "./build";
import { generateJson } from "./gemini";

/** The question types Ask supports. Gemini only picks one; the answer comes from ledger code. */
export const INTENTS = ["day_summary", "period_summary", "customer_balance", "top_debtors", "overdue", "last_payment", "best_day", "supplier_owed", "capital", "restock", "best_products", "best_payers", "credit_check", "unsupported"] as const;

export const Intent = z.object({
  intent: z.enum(INTENTS),
  datePhrase: z.string().optional(),
  periodPhrase: z.string().optional(),
  customerName: z.string().optional(),
  amountPhrase: z.string().optional(),
});
export type Intent = z.infer<typeof Intent>;

const intentSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    datePhrase: { type: "string", description: "A single day as written, e.g. 'yesterday', '14 October', 'last Saturday'" },
    periodPhrase: { type: "string", description: "A period as written: 'this week', 'last week', 'this month', 'last month', or a month name" },
    customerName: { type: "string", description: "Customer name as written" },
    amountPhrase: { type: "string", description: "A money amount as written, e.g. '20k', '20,000'" },
  },
  required: ["intent"],
} as const;

const ROUTER = `You route a shop owner's question (Pidgin or English) to one question type. Copy dates and names exactly as written; never resolve them.
- day_summary: what happened / sales / money on ONE day ("Wetin happen on 14 October?", "How much I sell yesterday?").
- period_summary: totals over a week or month ("How market dey this month?", "Profit last month?").
- customer_balance: how much one customer owes, or how they pay ("How much Tunde owe me?", "Tunde good payer?").
- top_debtors: who owes the most.
- overdue: who is late / overdue.
- last_payment: when a customer last paid.
- best_day: the best sales day in a period.
- supplier_owed: how much the shop owes suppliers, or when the next supplier payment is due ("Who I owe?", "When I go pay Alhaji?").
- capital: has the owner got the capital back, how much capital is still out.
- restock: how much money is safe to spend on new stock.
- best_products: which products sell best or make the most profit.
- best_payers: who pays well or on time.
- credit_check: should the owner give a customer credit, maybe of an amount ("Can I give Tunde 20k credit?").
- unsupported: anything else.
Late payers go to overdue. This month's profit goes to period_summary.`;

export async function routeQuestion(question: string): Promise<Intent> {
  const raw = await generateJson(`Question: ${question}`, intentSchema, ROUTER);
  const parsed = Intent.safeParse(raw);
  return parsed.success ? parsed.data : { intent: "unsupported" };
}

export interface AskContext {
  entries: readonly Entry[];
  settings: ShopSettings;
  today: string;
  debts: DebtState;
  customers: Known[];
  /** Product names for best-seller answers; falls back to the item id. */
  itemName?: (id: string) => string;
}

export interface Answer {
  text: string;
  /** The exact figures the answer was built from, shown so the owner can check them. */
  facts: { label: string; value: string }[];
}

const pretty = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Answers from ledger queries only, with fixed wording, so no number can be invented. */
export function answer(intent: Intent, ctx: AskContext): Answer {
  const { entries, settings, today, debts } = ctx;
  const name = (id: string) => ctx.customers.find((c) => c.id === id)?.name ?? id;
  const findCustomer = () => {
    if (!intent.customerName) return { error: "Which customer do you mean?" };
    const { match, candidates } = matchName(intent.customerName, ctx.customers);
    if (match) return { customer: match };
    return { error: candidates.length > 1 ? `Which one: ${candidates.map((c) => c.name).join(" or ")}?` : `I don't know a customer called ${intent.customerName}.` };
  };

  switch (intent.intent) {
    case "day_summary": {
      const date = intent.datePhrase ? resolveDate(intent.datePhrase, today, "past") : today;
      if (!date) return { text: `I could not tell which day "${intent.datePhrase}" is. Try a date like 14 October.`, facts: [] };
      if (date > today) return { text: "That day has not come yet.", facts: [] };
      const s = daySummary(entries, settings, date);
      if (s.salesCount === 0 && s.cashCollectedKobo === 0 && s.expensesKobo === 0 && s.purchasesKobo === 0) return { text: `Nothing was recorded on ${pretty(date)}.`, facts: [] };
      return {
        text: `On ${pretty(date)} you sold ${formatNaira(s.revenueKobo)} in ${s.salesCount} sale${s.salesCount === 1 ? "" : "s"}, gave ${formatNaira(s.creditGivenKobo)} on credit, and collected ${formatNaira(s.cashCollectedKobo)}.`,
        facts: [
          { label: "Sales", value: formatNaira(s.revenueKobo) },
          { label: "On credit", value: formatNaira(s.creditGivenKobo) },
          { label: "Collected", value: formatNaira(s.cashCollectedKobo) },
          { label: "Stock bought", value: formatNaira(s.purchasesKobo) },
          { label: "Expenses", value: formatNaira(s.expensesKobo) },
        ],
      };
    }
    case "period_summary":
    case "best_day": {
      const range = resolvePeriod(intent.periodPhrase ?? intent.datePhrase ?? "this month", today);
      if (!range) return { text: `I could not tell which period "${intent.periodPhrase}" is. Try "this week" or "last month".`, facts: [] };
      const label = range.from === range.to ? pretty(range.from) : `${pretty(range.from)} to ${pretty(range.to)}`;
      if (intent.intent === "best_day") {
        let best: { date: string; kobo: number } | null = null;
        for (let d = range.from; d <= range.to; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
          const kobo = summarizePeriod(entries, settings, d, d).revenueKobo;
          if (kobo > 0 && (!best || kobo > best.kobo)) best = { date: d, kobo };
        }
        return best
          ? { text: `Your best day from ${label} was ${pretty(best.date)}, with ${formatNaira(best.kobo)} in sales.`, facts: [{ label: pretty(best.date), value: formatNaira(best.kobo) }] }
          : { text: `No sales were recorded from ${label}.`, facts: [] };
      }
      const s = summarizePeriod(entries, settings, range.from, range.to);
      const profit = s.netProfitKobo === null ? `Profit is unavailable because ${s.itemsWithoutCost.length} item${s.itemsWithoutCost.length === 1 ? " has" : "s have"} no cost price.` : `Profit after expenses is ${formatNaira(s.netProfitKobo)}.`;
      return {
        text: `From ${label} you sold ${formatNaira(s.revenueKobo)} in ${s.salesCount} sales and collected ${formatNaira(s.cashCollectedKobo)}. ${profit}`,
        facts: [
          { label: "Sales", value: formatNaira(s.revenueKobo) },
          { label: "Collected", value: formatNaira(s.cashCollectedKobo) },
          { label: "Profit after expenses", value: s.netProfitKobo === null ? "Unavailable" : formatNaira(s.netProfitKobo) },
          { label: "Expenses", value: formatNaira(s.expensesKobo) },
        ],
      };
    }
    case "customer_balance": {
      const r = findCustomer();
      if (!r.customer) return { text: r.error!, facts: [] };
      const b = debts.balances.get(r.customer.id);
      const t = trustLabel(debts, r.customer.id);
      const owed = b?.owedKobo ?? 0;
      return {
        text: `${r.customer.name} owes you ${formatNaira(owed)}${(b?.overdueKobo ?? 0) > 0 ? `, and ${formatNaira(b!.overdueKobo)} of it is overdue` : ""}. Rating: ${t.label} — ${t.evidence}.${t.suggestedLimitKobo ? ` Suggested credit limit: ${formatNaira(t.suggestedLimitKobo)}.` : ""}`,
        facts: [
          { label: "Owes", value: formatNaira(owed) },
          { label: "Overdue", value: formatNaira(b?.overdueKobo ?? 0) },
          { label: "Rating", value: t.label },
        ],
      };
    }
    case "top_debtors": {
      const top = topDebtors(debts, 5);
      if (!top.length) return { text: "Nobody owes you money.", facts: [] };
      return {
        text: `The people who owe you most: ${top.map((t) => `${name(t.customerId)} ${formatNaira(t.owedKobo)}`).join(", ")}.`,
        facts: top.map((t) => ({ label: name(t.customerId), value: formatNaira(t.owedKobo) })),
      };
    }
    case "overdue": {
      const late = customerRows(debts, ctx.customers.map((c) => c.id)).filter((r) => r.overdueKobo > 0);
      if (!late.length) return { text: "Nobody is overdue. Well done.", facts: [] };
      const total = late.reduce((s, r) => s + r.overdueKobo, 0);
      return {
        text: `${late.length} customer${late.length === 1 ? " is" : "s are"} overdue, ${formatNaira(total)} in all: ${late.map((r) => `${name(r.customerId)} ${formatNaira(r.overdueKobo)}`).join(", ")}.`,
        facts: late.map((r) => ({ label: name(r.customerId), value: formatNaira(r.overdueKobo) })),
      };
    }
    case "last_payment": {
      const r = findCustomer();
      if (!r.customer) return { text: r.error!, facts: [] };
      const p = lastPayment(entries, r.customer.id);
      if (!p) return { text: `${r.customer.name} has not paid anything yet.`, facts: [] };
      const date = localDate(p.occurredAt, settings.timezone);
      return { text: `${r.customer.name} last paid ${formatNaira(p.amountKobo)} on ${pretty(date)}.`, facts: [{ label: pretty(date), value: formatNaira(p.amountKobo) }] };
    }
    case "supplier_owed": {
      const accounts = supplierAccounts(entries, settings, today);
      const sum = supplierSummary(accounts, today);
      if (sum.owedKobo === 0) return { text: "You don't owe any supplier.", facts: [] };
      const owed = accounts.filter((a) => a.owedKobo > 0);
      const next = owed.filter((a) => a.nextDueDate).sort((x, y) => x.nextDueDate!.localeCompare(y.nextDueDate!))[0];
      const nextText = next ? ` Next due: ${next.name} on ${pretty(next.nextDueDate!)}.` : "";
      const lateText = sum.overdueKobo > 0 ? ` ${formatNaira(sum.overdueKobo)} of it is overdue.` : "";
      return {
        text: `You owe ${owed.length} supplier${owed.length === 1 ? "" : "s"} ${formatNaira(sum.owedKobo)}: ${owed.map((a) => `${a.name} ${formatNaira(a.owedKobo)}`).join(", ")}.${lateText}${nextText}`,
        facts: owed.map((a) => ({ label: a.name, value: formatNaira(a.owedKobo) })),
      };
    }
    case "capital":
    case "restock": {
      const r = capitalReport(entries, settings, today);
      if (intent.intent === "restock")
        return {
          text: `You can safely spend ${formatNaira(r.safeToRestockKobo)} on new stock: cash in hand ${formatNaira(r.cashInHandKobo)} minus ${formatNaira(r.supplierOwedKobo)} you owe suppliers. Money customers owe (${formatNaira(r.receivablesKobo)}) is left out until they pay.`,
          facts: [
            { label: "Safe to restock", value: formatNaira(r.safeToRestockKobo) },
            { label: "Cash in hand", value: formatNaira(r.cashInHandKobo) },
            { label: "Owed to suppliers", value: formatNaira(r.supplierOwedKobo) },
          ],
        };
      return {
        text:
          r.toRecoverKobo > 0
            ? `You put in ${formatNaira(r.capitalInKobo)}. ${formatNaira(r.recoveredKobo)} is back in hand as cash; ${formatNaira(r.toRecoverKobo)} is still out in stock and customer debts.`
            : `You put in ${formatNaira(r.capitalInKobo)}, and all of it is back in hand as cash.`,
        facts: [
          { label: "Capital put in", value: formatNaira(r.capitalInKobo) },
          { label: "Back in hand", value: formatNaira(r.recoveredKobo) },
          { label: "Still out", value: formatNaira(r.toRecoverKobo) },
        ],
      };
    }
    case "best_products": {
      const range = resolvePeriod(intent.periodPhrase ?? "this month", today) ?? monthRange(today.slice(0, 7));
      const top = productProfit(entries, settings, range.from, range.to).slice(0, 5);
      const item = ctx.itemName ?? ((id: string) => id);
      if (!top.length) return { text: "No sales were recorded in that period.", facts: [] };
      return {
        text: `Your best sellers: ${top.map((p) => `${item(p.itemId)} ${formatNaira(p.revenueKobo)}${p.grossProfitKobo === null ? " (no cost price, profit unknown)" : `, profit ${formatNaira(p.grossProfitKobo)}`}`).join("; ")}.`,
        facts: top.map((p) => ({ label: item(p.itemId), value: formatNaira(p.revenueKobo) })),
      };
    }
    case "best_payers": {
      const rated = ctx.customers.map((c) => ({ c, t: trustLabel(debts, c.id) })).filter((x) => x.t.considered > 0 && x.t.onTime > 0);
      rated.sort((a, b) => b.t.onTime / b.t.considered - a.t.onTime / a.t.considered || b.t.considered - a.t.considered);
      const top = rated.slice(0, 5);
      if (!top.length) return { text: "Nobody has paid back enough credit yet to tell.", facts: [] };
      return {
        text: `Your best payers: ${top.map((x) => `${x.c.name} (paid ${x.t.onTime} of ${x.t.considered} on time)`).join(", ")}.`,
        facts: top.map((x) => ({ label: x.c.name, value: x.t.label })),
      };
    }
    case "credit_check": {
      const r = findCustomer();
      if (!r.customer) return { text: r.error!, facts: [] };
      const ask = intent.amountPhrase ? parseNairaToKobo(intent.amountPhrase) : null;
      const b = debts.balances.get(r.customer.id);
      const owed = b?.owedKobo ?? 0;
      const overdue = b?.overdueKobo ?? 0;
      const t = trustLabel(debts, r.customer.id);
      const reasons: string[] = [];
      if (overdue > 0) reasons.push(`${formatNaira(overdue)} is already overdue`);
      if (t.label === "High risk") reasons.push(`they are rated ${t.label}`);
      if (ask && t.suggestedLimitKobo !== null && owed + ask > t.suggestedLimitKobo)
        reasons.push(`that would bring them to ${formatNaira(owed + ask)}, above the suggested limit of ${formatNaira(t.suggestedLimitKobo)}`);
      const amountText = ask ? `${formatNaira(ask)} credit` : "credit";
      const advice = reasons.length
        ? `Be careful giving ${r.customer.name} ${amountText}: ${reasons.join("; ")}. Ask for part payment first, or give a smaller amount.`
        : t.label === "Insufficient history"
          ? `${r.customer.name} has little credit history yet. Start small and see how they pay.`
          : `${r.customer.name} looks fine for ${amountText}.`;
      return {
        text: `${advice} Their record: ${t.evidence}. They owe ${formatNaira(owed)} now. You decide.`,
        facts: [
          { label: "Owes now", value: formatNaira(owed) },
          { label: "Overdue", value: formatNaira(overdue) },
          { label: "Rating", value: t.label },
          ...(t.suggestedLimitKobo !== null ? [{ label: "Suggested limit", value: formatNaira(t.suggestedLimitKobo) }] : []),
        ],
      };
    }
    case "unsupported":
      return {
        text: "I can answer: what happened on a day, how a week or month went, how much a customer owes, who owes most, who is overdue, when someone last paid, your best day, what you owe suppliers, your capital, what is safe to spend on stock, best products, best payers, and whether to give someone credit.",
        facts: [],
      };
  }
}
