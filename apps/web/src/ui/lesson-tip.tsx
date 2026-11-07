import { addDays, monthRange } from "@trustbook/ledger";
import { behaviourNamespace, parseMemory, recallMemories } from "@trustbook/memory";
import type { Book } from "../lib/book";

/**
 * Today's agent tip (brief §6.7): last month's lesson, recalled from Walrus Memory rather than
 * recomputed, so it shows the learning loop. Shows nothing if no lesson is remembered yet.
 */
export async function LessonTip({ book }: { book: Book }) {
  const lastMonth = addDays(monthRange(book.today.slice(0, 7)).from, -1).slice(0, 7);
  let lesson: { summary: string; blobId: string; demo?: boolean } | null = null;
  try {
    const recalled = await recallMemories("month lesson sales profit owed collections", [behaviourNamespace(book.shop.id, lastMonth)], 10);
    for (const r of recalled) {
      const m = parseMemory(r.text);
      if (m?.kind === "month_lesson") {
        lesson = { summary: m.summary, blobId: r.blobId, demo: m.demo };
        break;
      }
    }
  } catch {
    return null;
  }
  if (!lesson) return null;
  const monthName = new Date(`${lastMonth}-15T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", timeZone: "UTC" });
  return (
    <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Tip from {monthName}</div>
      <p className="mt-1">{lesson.summary}</p>
      <p className="mt-2 text-xs text-stone-600">
        Remembered on Walrus{lesson.demo ? " · demo" : ""} · blob {lesson.blobId.slice(0, 10)}…
      </p>
    </section>
  );
}
