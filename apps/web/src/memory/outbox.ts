import { checkMemory, submitMemory, type MemoryEvent } from "@trustbook/memory";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, schema } from "../db/client";

const MAX_ATTEMPTS = 8;
const backoffMs = (attempts: number) => Math.min(30 * 60_000, 15_000 * 2 ** attempts);

/** Queues memories. A repeated dedupe key is ignored, so the same event is never written twice. */
export async function enqueue(shopId: string, demo: boolean, events: MemoryEvent[]): Promise<number> {
  if (!events.length) return 0;
  const rows = await db
    .insert(schema.outbox)
    .values(
      events.map((e) => ({
        id: ulid(),
        shopId,
        namespace: e.namespace,
        kind: e.kind,
        customerId: e.customerId ?? null,
        dedupeKey: e.dedupeKey,
        content: e.content,
        occurredAt: new Date(e.occurredAt),
        demo,
      })),
    )
    .onConflictDoNothing({ target: [schema.outbox.shopId, schema.outbox.dedupeKey] })
    .returning({ id: schema.outbox.id });
  return rows.length;
}

export interface OutboxRun {
  submitted: number;
  confirmed: number;
  retried: number;
  failed: number;
  stillWaiting: number;
}

/**
 * Submits due memories, then polls submitted jobs until each is confirmed with a blob id or the time
 * budget runs out. Safe to run concurrently: the relayer dedupes on the idempotency key.
 */
export async function processOutbox(budgetMs = 45_000): Promise<OutboxRun> {
  const stop = Date.now() + budgetMs;
  const run: OutboxRun = { submitted: 0, confirmed: 0, retried: 0, failed: 0, stillWaiting: 0 };
  const retry = async (id: string, attempts: number, error: string) => {
    const giveUp = attempts + 1 >= MAX_ATTEMPTS;
    await db
      .update(schema.outbox)
      .set({ status: giveUp ? "failed" : "pending", attempts: attempts + 1, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)), lastError: error.slice(0, 500), jobId: null })
      .where(eq(schema.outbox.id, id));
    if (giveUp) run.failed++;
    else run.retried++;
  };

  const due = await db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.status, "pending"), lte(schema.outbox.nextAttemptAt, sql`now()`)))
    .orderBy(asc(schema.outbox.occurredAt))
    .limit(20);
  for (const row of due) {
    if (Date.now() > stop) break;
    try {
      const jobId = await submitMemory(row.content, row.namespace, `${row.id}:${row.attempts}`);
      await db.update(schema.outbox).set({ status: "submitted", jobId }).where(eq(schema.outbox.id, row.id));
      run.submitted++;
    } catch (err) {
      await retry(row.id, row.attempts, err instanceof Error ? err.message : String(err));
    }
  }

  while (Date.now() < stop) {
    const waiting = await db.select().from(schema.outbox).where(inArray(schema.outbox.status, ["submitted"])).limit(50);
    if (!waiting.length) break;
    for (const row of waiting) {
      try {
        const s = await checkMemory(row.jobId!);
        if (s.state === "done") {
          await db.update(schema.outbox).set({ status: "confirmed", blobId: s.blobId, confirmedAt: new Date(), lastError: null }).where(eq(schema.outbox.id, row.id));
          run.confirmed++;
        } else if (s.state === "failed") await retry(row.id, row.attempts, s.error);
      } catch (err) {
        await retry(row.id, row.attempts, err instanceof Error ? err.message : String(err));
      }
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.outbox).where(inArray(schema.outbox.status, ["pending", "submitted"]))) as [{ n: number }];
  run.stillWaiting = n;
  return run;
}
