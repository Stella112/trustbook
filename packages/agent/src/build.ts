import {
  formatNaira,
  lineTotal,
  instantAt,
  localDate,
  localTime,
  parseNairaToKobo,
  proposeAllocations,
  resolveDate,
  validateEntry,
  type DebtState,
  type Entry,
} from "@trustbook/ledger";
import type { Proposal } from "./proposal";

export interface Known {
  id: string;
  name: string;
}

export interface BuildContext {
  shopId: string;
  timezone: string;
  /** The instant the owner confirms: becomes recordedAt, and occurredAt unless the note says another day. */
  now: string;
  customers: Known[];
  items: Known[];
  debts: DebtState;
  newId: () => string;
  source: "text" | "voice";
}

export interface Draft {
  kind: Proposal["kind"];
  /** Plain-words lines for the confirmation card. */
  lines: string[];
  /** Questions that must be answered before this can be saved. Empty means ready to confirm. */
  questions: string[];
  /** Notes the owner should see but that do not block saving. */
  notes: string[];
  entries: Entry[];
  newCustomers: Known[];
  newItems: Known[];
  question?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** Matches a written name to known names: exact, then starts-with or contains, then a small spelling slip. */
export function matchName(written: string, known: Known[]): { match?: Known; candidates: Known[] } {
  const w = norm(written);
  if (!w) return { candidates: [] };
  const exact = known.filter((k) => norm(k.name) === w);
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  const partial = known.filter((k) => {
    const n = norm(k.name);
    return n.startsWith(w) || w.startsWith(n) || n.split(" ").some((part) => part === w || w.split(" ").includes(part) && part.length > 3);
  });
  if (partial.length === 1) return { match: partial[0], candidates: partial };
  if (partial.length > 1) return { candidates: partial };
  // Word overlap, ignoring plurals and word order: "crates egg" matches "Eggs (crate)".
  const words = (s: string) => new Set(norm(s).split(" ").filter((x) => x.length >= 3).map((x) => x.replace(/(es|s)$/, "")));
  const mine = words(written);
  const scored = known
    .map((k) => ({ k, hits: [...words(k.name)].filter((x) => mine.has(x)).length }))
    .filter((x) => x.hits > 0);
  const best = Math.max(0, ...scored.map((x) => x.hits));
  const top = scored.filter((x) => x.hits === best).map((x) => x.k);
  if (top.length === 1) return { match: top[0], candidates: top };
  if (top.length > 1) return { candidates: top };
  const close = known.filter((k) => w.length >= 4 && editDistance(norm(k.name), w) <= (w.length >= 7 ? 2 : 1));
  return close.length === 1 ? { match: close[0], candidates: close } : { candidates: close };
}

/** Builds exact ledger entries from a proposal. Never guesses money: anything unclear becomes a question. */
export function buildDraft(p: Proposal, ctx: BuildContext): Draft {
  const d: Draft = { kind: p.kind, lines: [], questions: [...p.clarifications], notes: [], entries: [], newCustomers: [], newItems: [] };
  const money = (text: string | undefined, what: string): number | null => {
    if (text === undefined || text.trim() === "") return null;
    const kobo = parseNairaToKobo(text);
    if (kobo === null) d.questions.push(`How much is ${what}? I could not read "${text}".`);
    return kobo;
  };
  const today = localDate(ctx.now, ctx.timezone);
  let occurredAt = ctx.now;
  if (p.whenPhrase) {
    const date = resolveDate(p.whenPhrase, today, "past");
    if (!date) d.questions.push(`Which day is "${p.whenPhrase}"?`);
    else if (date > today) d.questions.push("That date is in the future. When did it happen?");
    else if (date !== today) {
      occurredAt = instantAt(date, localTime(ctx.now, ctx.timezone), ctx.timezone);
      d.notes.push(`Recorded for ${date}, not today.`);
    }
  }
  const base = (id = ctx.newId()) => ({ id, shopId: ctx.shopId, occurredAt, recordedAt: ctx.now, source: ctx.source, confirmedBy: "owner" });

  const customer = (required: boolean, allowNew: boolean): Known | undefined => {
    if (!p.customerName) {
      if (required) d.questions.push("Which customer?");
      return undefined;
    }
    const { match, candidates } = matchName(p.customerName, ctx.customers);
    if (match) return match;
    if (candidates.length > 1) {
      d.questions.push(`Which ${p.customerName}: ${candidates.map((c) => c.name).join(" or ")}?`);
      return undefined;
    }
    if (!allowNew) {
      d.questions.push(`I don't know a customer called ${p.customerName}. Add them first, or check the spelling.`);
      return undefined;
    }
    const created = { id: ctx.newId(), name: titleCase(p.customerName) };
    d.newCustomers.push(created);
    d.notes.push(`${created.name} is a new customer and will be added.`);
    return created;
  };

  const item = (name: string): Known => {
    const { match, candidates } = matchName(name, [...ctx.items, ...d.newItems]);
    if (match) return match;
    if (candidates.length > 1) d.questions.push(`Which item is "${name}": ${candidates.map((c) => c.name).join(" or ")}?`);
    const created = { id: ctx.newId(), name: titleCase(name) };
    d.newItems.push(created);
    return created;
  };

  const lines = (kind: "price" | "cost"): { itemId: string; name: string; qty: number; unitKobo: number }[] => {
    const out: { itemId: string; name: string; qty: number; unitKobo: number }[] = [];
    const items = p.items ?? [];
    if (!items.length) d.questions.push("What items?");
    const total = money(p.total, "the total");
    for (const [i, line] of items.entries()) {
      const qty = Number(line.qty.replace(/,/g, ""));
      if (!(qty > 0) || Math.round(qty * 1000) !== qty * 1000) {
        d.questions.push(`How many ${line.name}?`);
        continue;
      }
      const known = item(line.name);
      let unit = money(line.unitPrice, `one ${line.name}`);
      const lineTotal = money(line.lineTotal, `the ${line.name}`) ?? (items.length === 1 && unit === null ? total : null);
      if (unit === null && lineTotal !== null) {
        const milli = Math.round(qty * 1000);
        if ((lineTotal * 1000) % milli !== 0) {
          d.questions.push(`Is ${formatNaira(lineTotal)} for all ${line.qty} ${line.name}, or for each one?`);
          continue;
        }
        unit = (lineTotal * 1000) / milli;
      }
      if (unit === null) {
        d.questions.push(`What is the ${kind} of ${line.name}?`);
        continue;
      }
      out.push({ itemId: known.id, name: known.name, qty, unitKobo: unit });
      void i;
    }
    if (total !== null && out.length === items.length && out.length) {
      const sum = out.reduce((s, l) => s + lineTotal(l.qty, l.unitKobo), 0);
      if (sum !== total) d.questions.push(`The items add up to ${formatNaira(sum)} but the total says ${formatNaira(total)}. Which is right?`);
    }
    return out;
  };

  switch (p.kind) {
    case "record_sale": {
      const who = customer(false, true);
      const ls = lines("price");
      const total = ls.reduce((s, l) => s + lineTotal(l.qty, l.unitKobo), 0);
      let paidNow: number | null = null;
      if (p.paidInFull) paidNow = total;
      else if (p.paidNow) paidNow = money(p.paidNow, "the part paid now");
      else if (p.onCredit || p.promiseDatePhrase) paidNow = 0;
      else if (!who) paidNow = total;
      else d.questions.push(`Did ${who.name} pay now, or is it on credit?`);
      if (paidNow !== null && paidNow > total) d.questions.push(`${formatNaira(paidNow)} paid is more than the ${formatNaira(total)} total. Which is right?`);
      const credit = paidNow === null ? 0 : total - paidNow;
      if (credit > 0 && !who) d.questions.push("Who is buying on credit?");
      let promisedDate: string | undefined;
      if (p.promiseDatePhrase) {
        promisedDate = resolveDate(p.promiseDatePhrase, today, "future") ?? undefined;
        if (!promisedDate) d.questions.push(`Which date is "${p.promiseDatePhrase}"?`);
      }
      for (const l of ls) d.lines.push(`${l.qty} × ${l.name} at ${formatNaira(l.unitKobo)} = ${formatNaira(lineTotal(l.qty, l.unitKobo))}`);
      d.lines.push(`Total ${formatNaira(total)}${who ? ` · ${who.name}` : ""}`);
      if (paidNow !== null) d.lines.push(credit > 0 ? `Paid now ${formatNaira(paidNow)} · on credit ${formatNaira(credit)}${promisedDate ? ` · to pay by ${promisedDate}` : ""}` : "Paid in full");
      const newNoCost = ls.filter((l) => d.newItems.some((n) => n.id === l.itemId));
      if (newNoCost.length) d.notes.push(`New item${newNoCost.length > 1 ? "s" : ""} with no cost price yet: ${newNoCost.map((l) => l.name).join(", ")}. Profit shows as unavailable until you record buying ${newNoCost.length > 1 ? "them" : "it"}.`);
      if (!d.questions.length && paidNow !== null)
        d.entries.push({ ...base(), type: "SALE", items: ls.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPriceKobo: l.unitKobo })), totalKobo: total, paidNowKobo: paidNow, customerId: who?.id, promisedDate });
      break;
    }
    case "record_payment": {
      const who = customer(true, false);
      const amount = money(p.amount ?? p.total, "the payment");
      if (amount === null && !d.questions.some((q) => q.includes("payment"))) d.questions.push("How much did they pay?");
      if (who && amount) {
        const owed = ctx.debts.balances.get(who.id)?.owedKobo ?? 0;
        const allocations = proposeAllocations(ctx.debts, who.id, amount);
        d.lines.push(`${who.name} paid ${formatNaira(amount)} by ${p.method ?? "cash"}`);
        d.lines.push(owed === 0 ? "They owed nothing, so it is kept as credit for them." : amount > owed ? `Clears all ${formatNaira(owed)} owed; ${formatNaira(amount - owed)} kept as credit` : `Still owes ${formatNaira(owed - amount)} after this`);
        if (!d.questions.length) d.entries.push({ ...base(), type: "PAYMENT", customerId: who.id, amountKobo: amount, method: p.method ?? "cash", allocations });
      }
      break;
    }
    case "record_purchase": {
      const ls = lines("cost");
      const total = ls.reduce((s, l) => s + lineTotal(l.qty, l.unitKobo), 0);
      const paid = p.onCredit ? 0 : p.paidNow ? money(p.paidNow, "the part paid now") : total;
      for (const l of ls) d.lines.push(`Bought ${l.qty} × ${l.name} at ${formatNaira(l.unitKobo)} each`);
      d.lines.push(`Total ${formatNaira(total)}${p.supplier ? ` from ${p.supplier}` : ""}${paid !== null && paid < total ? ` · ${formatNaira(total - paid)} still owed to supplier` : " · paid"}`);
      if (!d.questions.length && paid !== null)
        d.entries.push({ ...base(), type: "PURCHASE", items: ls.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCostKobo: l.unitKobo })), totalKobo: total, supplier: p.supplier, paidNowKobo: paid });
      break;
    }
    case "record_expense": {
      const amount = money(p.amount ?? p.total, "the expense");
      if (amount === null && !d.questions.length) d.questions.push("How much was spent?");
      const category = (p.category || "other").toLowerCase();
      if (amount !== null) d.lines.push(`Spent ${formatNaira(amount)} on ${category}${p.note ? ` (${p.note})` : ""}`);
      if (!d.questions.length && amount !== null) d.entries.push({ ...base(), type: "EXPENSE", category, amountKobo: amount, note: p.note ?? "" });
      break;
    }
    case "add_promise": {
      const who = customer(true, false);
      const date = p.promiseDatePhrase ? resolveDate(p.promiseDatePhrase, today, "future") : null;
      if (!p.promiseDatePhrase) d.questions.push("When did they promise to pay?");
      else if (!date) d.questions.push(`Which date is "${p.promiseDatePhrase}"?`);
      if (who && date) {
        d.lines.push(`${who.name} promises to pay by ${date}`);
        if (!d.questions.length) d.entries.push({ ...base(), type: "PROMISE", customerId: who.id, promisedDate: date });
      }
      break;
    }
    case "add_customer": {
      if (!p.customerName) d.questions.push("What is the customer's name?");
      else {
        const { match } = matchName(p.customerName, ctx.customers);
        if (match && norm(match.name) === norm(p.customerName)) d.questions.push(`${match.name} is already a customer.`);
        else {
          d.newCustomers.push({ id: ctx.newId(), name: titleCase(p.customerName) });
          d.lines.push(`Add customer ${titleCase(p.customerName)}${p.phone ? ` · ${p.phone}` : ""}`);
        }
      }
      break;
    }
    case "ask_question":
      d.question = p.question;
      break;
    case "unclear":
      if (!d.questions.length) d.questions.push("I did not understand. Try: “Tunde collect 2 crates egg, 9k, he go pay Friday”.");
      break;
  }
  // Every entry must pass the ledger's own validation before it can be confirmed.
  d.entries = d.entries.map((e) => validateEntry(e));
  return d;
}

function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
