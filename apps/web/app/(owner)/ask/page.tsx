import { answer, QuotaError, routeQuestion, type Answer } from "@trustbook/agent";
import Link from "next/link";
import { loadBook } from "../../../src/lib/book";

const EXAMPLES = ["Wetin happen yesterday?", "How market dey this month?", "Who owe me pass?", "Who don late?", "Who I owe for supplier?", "How much I fit spend on stock?", "I don get my capital back?", "Which goods dey sell pass?", "Who be my best payers?", "Can I give Tunde 20k credit?"];

/** Ask: Gemini picks the question type; the answer and every number come from the ledger. */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const question = q.trim().slice(0, 200);
  let result: Answer | null = null;
  let error: string | null = null;
  if (question) {
    const book = await loadBook();
    try {
      const intent = await routeQuestion(question);
      result = answer(intent, { entries: book.entries, settings: book.settings, today: book.today, debts: book.debts, customers: book.customers, itemName: book.itemName });
    } catch (err) {
      error = err instanceof QuotaError ? err.message : "Something went wrong. Please try again.";
    }
  }

  return (
    <>
      <h1 className="mt-1 text-3xl">Ask</h1>
      <form action="/ask" method="get" className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={question}
          required
          maxLength={200}
          placeholder="Wetin happen on 14 October?"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base"
        />
        <button type="submit" className="rounded-full bg-emerald-700 px-4 py-3 font-semibold text-white">
          Ask
        </button>
      </form>

      {error && <p className="mt-4 text-red-700">{error}</p>}
      {result && (
        <div className="mt-4 rounded-xl bg-white p-4 border border-stone-200">
          <p className="text-lg">{result.text}</p>
          {result.facts.length > 0 && (
            <dl className="mt-3 border-t border-stone-100 pt-2 text-sm">
              {result.facts.map((f) => (
                <div key={f.label} className="flex justify-between py-1">
                  <dt className="text-stone-600">{f.label}</dt>
                  <dd className="font-semibold">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-2 text-xs text-stone-500">Numbers come straight from your book.</p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-sm text-stone-600">You can ask:</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <Link href={`/ask?q=${encodeURIComponent(e)}`} className="inline-block whitespace-nowrap rounded-full border border-stone-300 bg-white px-3 py-1 text-sm">
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
