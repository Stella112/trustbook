import { buildDraft, parseNote, QuotaError, type Draft } from "@trustbook/agent";
import { instantAt, localTime } from "@trustbook/ledger";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdviceLoading, CreditAdvice } from "../../../src/ui/credit-advice";
import { ulid } from "ulid";
import { loadBook } from "../../../src/lib/book";
import { signDraft } from "../../../src/lib/draft";
import { pinRequired } from "../../../src/lib/pin";
import { ConfirmForm } from "./confirm-form";
import { VoiceButton } from "../../../src/ui/voice-button";

const MAX_NOTE = 300;

/** Reads the owner's note with Gemini, then shows a confirmation card. Nothing is saved until Confirm. */
export default async function RecordPage({ searchParams }: { searchParams: Promise<{ text?: string; error?: string; edit?: string; voice?: string }> }) {
  const { text = "", error, edit, voice } = await searchParams;
  const fromVoice = voice === "1";
  const note = text.trim().slice(0, MAX_NOTE);
  if (edit !== undefined) return <NoteBox note={edit.slice(0, MAX_NOTE)} />;
  if (!note) return <NoteBox note="" message={error === "expired" ? "That card expired or was changed. Please record it again." : undefined} />;

  const book = await loadBook();
  let proposal: Awaited<ReturnType<typeof parseNote>>;
  try {
    proposal = await parseNote(note, { customerNames: book.customers.map((c) => c.name), itemNames: book.items.map((i) => i.name) });
  } catch (err) {
    return <NoteBox note={note} message={err instanceof QuotaError ? err.message : "Something went wrong reading that. Please try again."} />;
  }
  if (proposal.kind === "ask_question") redirect(`/ask?q=${encodeURIComponent(proposal.question || note)}`);

  let draft: Draft;
  {
    const now = instantAt(book.today, localTime(new Date().toISOString(), book.shop.timezone), book.shop.timezone);
    draft = buildDraft(proposal, {
      shopId: book.shop.id,
      timezone: book.shop.timezone,
      now,
      customers: book.customers,
      items: book.items,
      debts: book.debts,
      newId: ulid,
      source: fromVoice ? "voice" : "text",
    });
  }

  // Recall-backed advice whenever an existing customer is about to take credit (brief §6.11 step 2).
  const creditSale = draft.entries.find((e) => e.type === "SALE" && e.customerId && e.totalKobo > e.paidNowKobo);
  const creditTo =
    creditSale?.type === "SALE" && creditSale.customerId && book.customers.some((c) => c.id === creditSale.customerId)
      ? { customerId: creditSale.customerId, amountKobo: creditSale.totalKobo - creditSale.paidNowKobo }
      : null;
  const ready = draft.questions.length === 0 && (draft.entries.length > 0 || draft.newCustomers.length > 0);
  const token = ready ? signDraft({ shopId: book.shop.id, entries: draft.entries, newCustomers: draft.newCustomers, newItems: draft.newItems }) : "";

  return (
    <>
      <h1 className="mt-1 text-3xl">Check this</h1>
      <p className="mt-1 text-stone-600">
        {fromVoice && <span className="font-semibold">You said: </span>}“{note}”
      </p>
      <div className="mt-4 rounded-xl border-2 border-emerald-700 bg-white p-4">
        <div className="text-sm font-semibold uppercase tracking-wide text-emerald-800">{KIND_TITLE[draft.kind]}</div>
        <ul className="mt-2 space-y-1 text-lg">
          {draft.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {draft.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-stone-700">
            {draft.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
        {draft.questions.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3">
            <div className="font-semibold text-amber-900">Please tell me:</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900">
              {draft.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {creditTo && (
        <Suspense fallback={<AdviceLoading />}>
          <CreditAdvice book={book} customerId={creditTo.customerId} amountKobo={creditTo.amountKobo} />
        </Suspense>
      )}
      {ready ? (
        <ConfirmForm
          token={token}
          editHref={`/record?edit=${encodeURIComponent(note)}`}
          needsPin={pinRequired(book.shop) && draft.entries.some((e) => e.type === "PAYMENT")}
        />
      ) : (
        <NoteBox note={note} message="Add the missing details and send again." />
      )}
    </>
  );
}

const KIND_TITLE: Record<Draft["kind"], string> = {
  record_sale: "Sale",
  record_payment: "Payment",
  record_purchase: "Stock bought",
  record_expense: "Expense",
  add_promise: "Promise to pay",
  add_customer: "New customer",
  ask_question: "Question",
  unclear: "Not sure",
};

function NoteBox({ note, message }: { note: string; message?: string }) {
  return (
    <div className="mt-4">
      {!note && <h1 className="mt-1 text-3xl">Record</h1>}
      {message && <p className="mb-2 text-stone-700">{message}</p>}
      <form action="/record" method="get">
        <textarea
          key={note}
          name="text"
          defaultValue={note}
          required
          maxLength={MAX_NOTE}
          rows={3}
          placeholder="Tunde collect 2 crates egg, 9k, he go pay Friday"
          className="block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg"
        />
        <button type="submit" className="mt-3 w-full rounded-full bg-emerald-700 px-4 py-4 text-lg font-semibold text-white">
          Read it
        </button>
      </form>
      {/* Keyed by the note so the button resets when a voice note opens this same page with new text. */}
      <VoiceButton key={note} />
    </div>
  );
}
