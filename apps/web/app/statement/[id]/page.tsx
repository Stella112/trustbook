import { customerHistory, formatNaira, localDate } from "@trustbook/ledger";
import { notFound } from "next/navigation";
import { loadBook } from "../../../src/lib/book";
import { appUrl, signPayLink, whatsappLink } from "../../../src/lib/paylink";
import { PrintButton } from "./print-button";

const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A customer statement made to print or "Save as PDF" from the browser's own print screen, so no
 * PDF library or paid service is needed. Every row comes from the ledger with corrections applied.
 * Lives outside the (owner) layout so the printed page has no app menus; loadBook still requires
 * the owner to be signed in.
 */
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await loadBook();
  const customer = book.customers.find((c) => c.id === id);
  if (!customer) notFound();
  const tz = book.shop.timezone;

  let running = 0;
  const rows = [...customerHistory(book.entries, id)].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id)).flatMap((e) => {
    const date = localDate(e.occurredAt, tz);
    if (e.type === "SALE") {
      const credit = e.totalKobo - e.paidNowKobo;
      running += credit;
      return [{ id: e.id, date, detail: `Bought ${formatNaira(e.totalKobo)}${e.paidNowKobo > 0 ? `, paid ${formatNaira(e.paidNowKobo)} then` : ""}`, credit, paid: 0, balance: running }];
    }
    if (e.type === "PAYMENT") {
      running -= e.amountKobo;
      const how = e.method === "sui" ? "Paid on Sui (verified)" : e.method === "transfer" ? "Paid by transfer" : "Paid cash";
      return [{ id: e.id, date, detail: how, credit: 0, paid: e.amountKobo, balance: running }];
    }
    return [];
  });
  const b = book.debts.balances.get(id);
  const owed = b?.owedKobo ?? 0;
  const overdue = b?.overdueKobo ?? 0;
  const payUrl = owed > 0 ? `${appUrl()}/p/${signPayLink({ shopId: book.shop.id, customerId: id, amountKobo: owed })}` : "";
  const shareText = `Statement from ${book.shop.name} for ${customer.name}, ${pretty(book.today)}: you owe ${formatNaira(owed)}${overdue > 0 ? ` (${formatNaira(overdue)} overdue)` : ""}.${payUrl ? ` Pay here: ${payUrl}` : ""}`;
  const whatsapp = customer.phone ? whatsappLink(customer.phone, shareText) : null;

  return (
    <main className="mx-auto max-w-2xl bg-white p-6 text-stone-900 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <a href={`/customers/${id}`} className="btn-ghost px-4 py-2">← Back</a>
        <PrintButton />
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-ghost px-4 py-2">
            Send on WhatsApp
          </a>
        )}
      </div>
      {book.shop.mode === "DEMO" && <p className="mb-4 rounded bg-lime-200 px-3 py-1 text-sm font-semibold">Demo data · a sample shop, not a real business</p>}

      <header className="flex items-start justify-between gap-4 border-b border-stone-300 pb-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-stone-500">Statement</div>
          <h1 className="text-2xl">{book.shop.name}</h1>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">{customer.name}</div>
          {customer.phone && <div>+{customer.phone}</div>}
          <div className="text-stone-600">As of {pretty(book.today)}</div>
        </div>
      </header>

      <section className="my-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-stone-300 p-3">
          <div className="text-sm text-stone-600">Amount owed</div>
          <div className="text-2xl font-bold">{formatNaira(owed)}</div>
        </div>
        <div className="rounded-lg border border-stone-300 p-3">
          <div className="text-sm text-stone-600">Overdue</div>
          <div className={`text-2xl font-bold ${overdue > 0 ? "text-red-700" : ""}`}>{formatNaira(overdue)}</div>
        </div>
      </section>

      {rows.length === 0 ? (
        <p>No credit or payments recorded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-stone-300 text-left text-stone-600">
            <tr>
              <th className="py-2 pr-2 font-medium">Date</th>
              <th className="py-2 pr-2 font-medium">Details</th>
              <th className="py-2 pr-2 text-right font-medium">Credit</th>
              <th className="py-2 pr-2 text-right font-medium">Paid</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {rows.map((r) => (
              <tr key={r.id} className="break-inside-avoid">
                <td className="py-2 pr-2 whitespace-nowrap">{pretty(r.date)}</td>
                <td className="py-2 pr-2">{r.detail}</td>
                <td className="py-2 pr-2 text-right">{r.credit ? formatNaira(r.credit) : ""}</td>
                <td className="py-2 pr-2 text-right">{r.paid ? formatNaira(r.paid) : ""}</td>
                <td className="py-2 text-right font-semibold">{r.balance < 0 ? `${formatNaira(-r.balance)} ahead` : formatNaira(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {payUrl && (
        <p className="mt-6 break-all text-sm">
          Pay with Sui (Trustbook covers the gas fee): <span className="font-semibold">{payUrl}</span>
        </p>
      )}
      <p className="mt-6 text-xs text-stone-500">Made with Trustbook from {book.shop.name}&apos;s credit book. Sui payments are verified on-chain; cash and transfers are confirmed by the shop.</p>
    </main>
  );
}
