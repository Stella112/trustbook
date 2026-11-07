import { customerHistory, formatNaira, trustLabel } from "@trustbook/ledger";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdviceLoading, CreditAdvice } from "../../../../src/ui/credit-advice";
import { loadBook } from "../../../../src/lib/book";
import { appUrl, signPayLink, whatsappLink } from "../../../../src/lib/paylink";
import { CopyLink } from "../../../../src/ui/copy-link";
import { PIN_MESSAGES, pinRequired } from "../../../../src/lib/pin";
import { PayQr } from "../../../../src/ui/qr";
import { markAsPaid } from "./actions";
import { EntryLine } from "../../../../src/ui/entry-line";
import { LabelBadge, Section, shortDate, Stat } from "../../../../src/ui/kit";

/** One customer: what they owe, how they pay, and their full history. */
export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; error?: string }> }) {
  const { id } = await params;
  const { paid, error } = await searchParams;
  const book = await loadBook();
  const customer = book.customers.find((c) => c.id === id);
  if (!customer) notFound();
  const balance = book.debts.balances.get(id);
  const trust = trustLabel(book.debts, id, book.overrides[id]);
  const open = book.debts.debts.filter((d) => d.customerId === id && d.openKobo > 0);
  const history = customerHistory(book.entries, id);
  const owed = balance?.owedKobo ?? 0;
  const payUrl = owed > 0 ? `${appUrl()}/p/${signPayLink({ shopId: book.shop.id, customerId: id, amountKobo: owed })}` : "";
  const whatsapp =
    owed > 0 && customer.phone
      ? whatsappLink(customer.phone, `Hello ${customer.name}, this is ${book.shop.name}. You owe ${formatNaira(owed)}. You can pay here: ${payUrl} Thank you!`)
      : null;

  return (
    <>
      <h1 className="mt-1 text-3xl font-bold">{customer.name}</h1>
      <div className="mt-1">
        <LabelBadge label={trust.label} overridden={trust.overridden} />
      </div>
      <Suspense fallback={<AdviceLoading />}>
        <CreditAdvice book={book} customerId={id} />
      </Suspense>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Owes you" value={formatNaira(balance?.owedKobo ?? 0)} />
        <Stat label="Overdue" value={formatNaira(balance?.overdueKobo ?? 0)} tone={(balance?.overdueKobo ?? 0) > 0 ? "warn" : undefined} />
      </section>
      {(balance?.creditKobo ?? 0) > 0 && <p className="mt-2 text-sm text-emerald-800">Holds {formatNaira(balance!.creditKobo)} credit from paying extra.</p>}
      {paid && <p role="status" className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">Payment saved.</p>}

      {owed > 0 && (
        <Section title="Get paid">
          <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-emerald-700 px-4 py-3 text-center text-lg font-semibold text-white">
                Send reminder on WhatsApp
              </a>
            ) : (
              <p className="text-sm text-stone-600">Add a phone number to send WhatsApp reminders.</p>
            )}
            <CopyLink url={payUrl} />
            <details className="rounded-xl border border-stone-200 px-3 py-2">
              <summary className="min-h-10 cursor-pointer py-2 font-semibold">Show QR code to scan</summary>
              <PayQr url={payUrl} caption={`${customer.name} pays all ${formatNaira(owed)}`} />
            </details>
            <form action={markAsPaid} className="border-t border-stone-100 pt-3">
              <input type="hidden" name="customerId" value={id} />
              <div className="text-sm font-medium">Paid in cash or by transfer?</div>
              <div className="mt-2 flex gap-2">
                <input name="amount" required inputMode="decimal" placeholder={formatNaira(owed).replace("₦", "")} className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2" />
                <select name="method" className="rounded-xl border border-stone-300 bg-white px-2 py-2">
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              {pinRequired(book.shop) && (
                <input name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" required placeholder="Your 6-number PIN" aria-label="Your 6-number PIN" className="mt-2 block w-full rounded-xl border border-stone-300 px-3 py-2" />
              )}
              {error === "amount" && <p className="mt-1 text-sm text-red-700">Write the amount like 5,000 or 5k.</p>}
              {error?.startsWith("pin-") && <p className="mt-1 text-sm text-red-700">{PIN_MESSAGES[error.slice(4) as keyof typeof PIN_MESSAGES] ?? PIN_MESSAGES.wrong}</p>}
              <button type="submit" className="mt-2 w-full rounded-xl border border-stone-400 px-4 py-2 font-semibold">
                Mark as paid
              </button>
              <p className="mt-1 text-xs text-stone-500">Recorded as merchant-confirmed.</p>
            </form>
          </div>
        </Section>
      )}

      <Section title="Unpaid debts">
        {open.length === 0 ? (
          <p className="text-stone-600">Nothing owed.</p>
        ) : (
          <ul className="rounded-xl bg-white px-4 shadow-sm">
            {open.map((d) => (
              <li key={d.saleId} className="border-b border-stone-100 py-3 last:border-0">
                <div className="flex justify-between">
                  <span>
                    {shortDate(d.saleDate)} <span className="text-sm text-stone-500">· due {shortDate(d.dueDate)}</span>
                  </span>
                  <span className={d.dueDate < book.today ? "font-semibold text-red-700" : "font-semibold"}>{formatNaira(d.openKobo)}</span>
                </div>
                <details className="mt-1">
                  <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-emerald-800">QR code for this debt</summary>
                  {/* A per-debt link: the payment goes to this sale first (brief §6.5 allocation). */}
                  <PayQr
                    url={`${appUrl()}/p/${signPayLink({ shopId: book.shop.id, customerId: id, saleId: d.saleId, amountKobo: d.openKobo })}`}
                    caption={`${formatNaira(d.openKobo)} from ${shortDate(d.saleDate)}`}
                  />
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History">
        <ul className="rounded-xl bg-white px-4 shadow-sm">
          {history.map((e) => (
            <EntryLine key={e.id} e={e} book={book} showTime={false} />
          ))}
        </ul>
      </Section>
    </>
  );
}
