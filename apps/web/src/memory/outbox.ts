import { addDays, localDate } from "@trustbook/ledger";
import { checkMemory, HARD_CAP, isHoldable, SOFT_CAP, submitMemory, weekStartOf, weekSummaryEvent, type MemoryEvent } from "@trustbook/memory";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, schema } from "../db/client";

const MAX_ATTEMPTS = 8;
const backoffMs = (attempts: number) => Math.min(30 * 60_000, 15_000 * 2 ** attempts);

/**
 * Queues memories. A repeated dedupe key is ignored, so the same event is never written twice.
 * Brief §6.8b: once a month's namespace holds SOFT_CAP memories, per-event memories are held (not
 * written) and later replaced by weekly summaries; nothing is ever queued past HARD_CAP.
 */
export async function enqueue(shopId: string, demo: boolean, events: MemoryEvent[]): Promise<number> {
  if (!events.length) return 0;
  const namespaces = [...new Set(events.map((e) => e.namespace))];
  const counted = await db
    .select({ namespace: schema.outbox.namespace, n: sql<number>`count(*)::int` })
    .from(schema.outbox)
    .where(and(eq(schema.outbox.shopId, shopId), inArray(schema.outbox.namespace, namespaces), inArray(schema.outbox.status, ["pending", "submitted", "confirmed"])))
    .groupBy(schema.outbox.namespace);
  const used = new Map(counted.map((c) => [c.namespace, c.n]));
  const rowsToInsert = events.map((e) => {
    const n = used.get(e.namespace) ?? 0;
    const hold = n >= HARD_CAP || (n >= SOFT_CAP && isHoldable(e.kind));
    if (hold) console.info(`memory cap: holding ${e.kind} in ${e.namespace} (${n} already written)`);
    else used.set(e.namespace, n + 1);
    return {
      id: ulid(),
      shopId,
      namespace: e.namespace,
      kind: e.kind,
      customerId: e.customerId ?? null,
      dedupeKey: e.dedupeKey,
      content: e.content,
      occurredAt: new Date(e.occurredAt),
      demo,
      status: hold ? ("held" as const) : ("pending" as const),
    };
  });
  const rows = await db
    .insert(schema.outbox)
    .values(rowsToInsert)
    .onConflictDoNothing({ target: [schema.outbox.shopId, schema.outbox.dedupeKey] })
    .returning({ id: schema.outbox.id });
  return rows.length;
}

/**
 * Turns held per-event memories into one summary per customer per finished week (brief §6.8b).
 * The originals are marked "summarized"; the summaries go through the normal outbox.
 */
export async function summarizeHeldWeeks(): Promise<number> {
  const held = await db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.status, "held"), sql`${schema.outbox.kind} <> 'week_summary'`));
  if (!held.length) return 0;
  let made = 0;
  for (const shopId of new Set(held.map((h) => h.shopId))) {
    const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
    if (!shop) continue;
    const customers = await db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.shopId, shopId));
    const today = localDate(new Date().toISOString(), shop.timezone);
    const groups = new Map<string, typeof held>();
    for (const h of held.filter((x) => x.shopId === shopId && x.customerId)) {
      const date = localDate(h.occurredAt.toISOString(), shop.timezone);
      const weekStart = weekStartOf(date);
      if (addDays(weekStart, 6) >= today) continue; // the week is not over yet
      const key = `${h.namespace}|${h.customerId}|${weekStart}`;
      groups.set(key, [...(groups.get(key) ?? []), h]);
    }
    for (const [key, rows] of groups) {
      const [namespace, customerId, weekStart] = key.split("|") as [string, string, string];
      const month = namespace.slice(-7);
      const event = weekSummaryEvent(
        { shopId, timezone: shop.timezone, demo: shop.mode === "DEMO", customerName: (id) => customers.find((c) => c.id === id)?.name ?? "a customer" },
        customerId,
        weekStart,
        month,
        rows.map((r) => ({ kind: r.kind, customerId, occurredAt: r.occurredAt.toISOString(), content: r.content })),
      );
      await enqueue(shopId, shop.mode === "DEMO", [event]);
      await db.update(schema.outbox).set({ status: "summarized" }).where(inArray(schema.outbox.id, rows.map((r) => r.id)));
      console.info(`memory cap: summarised ${rows.length} held memories for ${customerId}, week of ${weekStart}`);
      made++;
    }
  }
  return made;
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
  await summarizeHeldWeeks().catch((err) => console.error("memory cap summaries:", err instanceof Error ? err.message : err));
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
