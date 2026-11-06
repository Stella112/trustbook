import { createAnchor, tatum, updateAnchor } from "@trustbook/chain";
import { addDays, buildDayRecord, entriesRecordedOn, GENESIS, localDate, monthRange, validateEntry, type DayRecord } from "@trustbook/ledger";
import { writeSealed } from "@trustbook/memory";
import { batchHeader, encodeSealed, ledgerNamespace, monthHeader, sealCheckpoint, totalsAt, type BatchRecord } from "@trustbook/recovery-core";
import { and, asc, eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, schema } from "../db/client";

type Log = (line: string) => void;

/** Monday of the ISO week containing a date. */
const weekStart = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Seals every closed day that has entries and is not sealed yet (brief §6.8), in batches of one week
 * that never cross a month (approved: weekly storage). After each batch is confirmed on Walrus the
 * shop's Sui anchor is updated, so the anchor never points past what is stored. Then each fully
 * sealed month without a checkpoint gets one. `through` defaults to yesterday: today is still open.
 */
export async function sealShop(shopId: string, opts: { through?: string; log?: Log; deadline?: number } = {}) {
  const log = opts.log ?? (() => {});
  // A Walrus write plus an anchor update takes about 40 s; never start one that cannot finish in time.
  const timeLeft = () => opts.deadline === undefined || Date.now() < opts.deadline - 60_000;
  let stoppedEarly = false;
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  if (!shop) throw new Error(`no shop ${shopId}`);
  const today = localDate(new Date().toISOString(), shop.timezone);
  const through = opts.through && opts.through < today ? opts.through : addDays(today, -1);

  let anchorId = shop.anchorObjectId;
  let capId = shop.anchorCapId;
  if (!anchorId || !capId) {
    const a = await createAnchor(shop.id);
    [anchorId, capId] = [a.anchorId, a.capId];
    await db.update(schema.shops).set({ anchorObjectId: anchorId, anchorCapId: capId }).where(eq(schema.shops.id, shop.id));
    log(`created anchor ${anchorId} (tx ${a.digest})`);
  }

  const [rows, customers, items, sealed] = await Promise.all([
    db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.recordedAt)),
    db.select().from(schema.customers).where(eq(schema.customers.shopId, shop.id)),
    db.select().from(schema.items).where(eq(schema.items.shopId, shop.id)),
    db.select().from(schema.sealedDays).where(eq(schema.sealedDays.shopId, shop.id)).orderBy(asc(schema.sealedDays.date)),
  ]);
  const entries = rows.map((r) => validateEntry(r.data));
  const lastSealed = sealed.at(-1);
  let prevHash = lastSealed?.hash ?? GENESIS;
  let dayCount = sealed.length;

  const pending = [...new Set(entries.map((e) => localDate(e.recordedAt, shop.timezone)))]
    .filter((d) => (!lastSealed || d > lastSealed.date) && d <= through)
    .sort();
  const groups = new Map<string, string[]>();
  for (const d of pending) {
    const key = `${d.slice(0, 7)}|${weekStart(d)}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  const snapshot = {
    name: shop.name,
    ownerName: shop.ownerName,
    timezone: shop.timezone,
    openingCashKobo: shop.openingCashKobo,
    defaultDueDays: shop.defaultDueDays,
    suiAddress: shop.suiAddress,
    mode: shop.mode,
  };
  const directory: BatchRecord["directory"] = {
    customers: Object.fromEntries(customers.map((c) => [c.id, { name: c.name, phone: c.phone }])),
    items: Object.fromEntries(items.map((i) => [i.id, { name: i.name, unit: i.unit }])),
  };
  const sealedBatches: { from: string; to: string; blobId: string; anchorTx: string }[] = [];

  for (const dates of groups.values()) {
    if (!timeLeft()) {
      // Days are sealed oldest first, so stopping here leaves the chain whole; the next run continues.
      stoppedEarly = true;
      log(`stopping before ${dates[0]}: out of time, the next run continues`);
      break;
    }
    const sealedAt = new Date().toISOString();
    const days: DayRecord[] = [];
    for (const date of dates) {
      const d = buildDayRecord({ shopId: shop.id, date, sealedAt, demo: shop.mode === "DEMO", entries: entriesRecordedOn(entries, date, shop.timezone), prevHash });
      days.push(d);
      prevHash = d.hash;
    }
    const from = dates[0]!;
    const to = dates.at(-1)!;
    const record: BatchRecord = { v: 1, kind: "batch", shopId: shop.id, from, to, sealedAt, shop: snapshot, directory, days };
    const namespace = ledgerNamespace(shop.id, to.slice(0, 7));
    log(`sealing ${from}..${to} (${days.length} days) to ${namespace}…`);
    const blobId = await writeSealed(encodeSealed(batchHeader(shop.id, from, to), record), namespace, tatum());
    dayCount += days.length;
    const id = ulid();
    await db.transaction(async (tx) => {
      await tx.insert(schema.seals).values({ id, shopId: shop.id, kind: "batch", namespace, fromDate: from, toDate: to, dayCount, headHash: prevHash, blobId, sealedAt: new Date(sealedAt) });
      await tx.insert(schema.sealedDays).values(days.map((d) => ({ shopId: shop.id, date: d.date, hash: d.hash, sealId: id })));
    });
    // Only now, with the write confirmed, does the anchor move forward.
    const anchorTx = await updateAnchor({ anchorId, capId, lastDay: to, headHashHex: prevHash, dayCount });
    await db.update(schema.seals).set({ anchorTx }).where(eq(schema.seals.id, id));
    log(`  blob ${blobId}; anchor → ${to}, ${dayCount} days (tx ${anchorTx})`);
    sealedBatches.push({ from, to, blobId, anchorTx });
  }

  // Monthly checkpoints for months whose every day is now sealed.
  const allSealed = await db.select().from(schema.sealedDays).where(eq(schema.sealedDays.shopId, shop.id)).orderBy(asc(schema.sealedDays.date));
  const haveCheckpoint = new Set((await db.select({ to: schema.seals.toDate }).from(schema.seals).where(and(eq(schema.seals.shopId, shop.id), eq(schema.seals.kind, "month")))).map((r) => r.to.slice(0, 7)));
  const months = [...new Set(allSealed.map((d) => d.date.slice(0, 7)))].filter((m) => monthRange(m).to <= through && !haveCheckpoint.has(m));
  const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  const counts = await db
    .select({ namespace: schema.outbox.namespace, n: sql<number>`count(*)::int` })
    .from(schema.outbox)
    .where(and(eq(schema.outbox.shopId, shop.id), eq(schema.outbox.status, "confirmed")))
    .groupBy(schema.outbox.namespace);
  const behaviourCounts = Object.fromEntries(counts.map((c) => [c.namespace, c.n]));
  const sealedMonths: string[] = [];
  for (const month of months) {
    if (stoppedEarly || !timeLeft()) {
      stoppedEarly = true;
      break;
    }
    const sealedAt = new Date().toISOString();
    const inChain = allSealed.filter((d) => d.date <= monthRange(month).to);
    const { totals, balances } = totalsAt(entries, settings, month, sealedAt);
    const record = sealCheckpoint({ v: 1, kind: "month", shopId: shop.id, month, sealedAt, lastDayHash: inChain.at(-1)!.hash, dayCount: inChain.length, monthTotals: totals, customerBalances: balances, behaviourCounts });
    const namespace = ledgerNamespace(shop.id, month);
    log(`sealing checkpoint ${month}…`);
    const blobId = await writeSealed(encodeSealed(monthHeader(shop.id, month), record), namespace, tatum());
    await db.insert(schema.seals).values({ id: ulid(), shopId: shop.id, kind: "month", namespace, fromDate: monthRange(month).from, toDate: monthRange(month).to, dayCount: inChain.length, headHash: record.hash, blobId, sealedAt: new Date(sealedAt) });
    log(`  blob ${blobId}`);
    sealedMonths.push(month);
  }
  return { anchorId, batches: sealedBatches, checkpoints: sealedMonths, dayCount, stoppedEarly };
}

/**
 * Seals a shop unless another run is already sealing it. Two runs at once could write the same day
 * twice with different seal times, which recovery would rightly report as a conflict. The lock is a
 * Postgres transaction-level advisory lock, held for the whole run and released when it ends, so no
 * new table is needed and a crashed run never leaves a stale lock behind.
 */
export async function sealShopExclusive(shopId: string, opts: Parameters<typeof sealShop>[1] = {}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${`trustbook-seal:${shopId}`})) as locked`);
    if (!row?.locked) return { skipped: true as const, reason: "another seal run holds the lock" };
    return { skipped: false as const, ...(await sealShop(shopId, opts)) };
  });
}
