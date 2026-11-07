import { findAnchorCap } from "@trustbook/chain";
import { localDate, monthRange, normalizeLabel, validateEntry, type Entry } from "@trustbook/ledger";
import { dedupeKeyFor, parseMemory } from "@trustbook/memory";
import type { RecoveredBooks, RecoveredMemory } from "@trustbook/recovery-core";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { hashPin, PIN_PATTERN } from "../lib/auth";
import { db, schema } from "../db/client";

type Log = (line: string) => void;

/**
 * Fills an EMPTY database from what the recovery tool rebuilt (brief §6.8 "importer"). Entries are
 * inserted exactly as sealed, so their hashes still match Walrus and sealing can continue the same
 * chain; the seal history and the shop's anchor are restored for that reason too. Behaviour
 * memories come back into the outbox as confirmed, with their real blob ids and the dedupe keys
 * they were written under, so the app never writes them a second time.
 */
export async function importRecovered(books: RecoveredBooks, memories: RecoveredMemory[], opts: { pin?: string; log?: Log } = {}) {
  const log = opts.log ?? (() => {});
  if (!books.ok) throw new Error("the recovery report has failures; fix or explain them before importing");
  const [existing] = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.id, books.shopId));
  if (existing) throw new Error(`shop ${books.shopId} already exists in this database; import only into an empty one`);
  if (books.shop.mode === "LIVE" && !(opts.pin && PIN_PATTERN.test(opts.pin))) throw new Error("a LIVE shop needs a new 6-digit PIN (--pin), because PINs are never stored on Walrus");

  const entries: Entry[] = books.entries.map((e) => validateEntry(e));
  const anchorCapId = books.anchorId ? await findAnchorCap(books.anchorId) : null;
  if (books.anchorId && !anchorCapId) log(`warning: no AnchorCap for ${books.anchorId} held by the server key; sealing will need one`);

  const today = localDate(new Date().toISOString(), books.shop.timezone);
  const settings = { shopId: books.shopId, timezone: books.shop.timezone, openingCashKobo: books.shop.openingCashKobo, defaultDueDays: books.shop.defaultDueDays };
  const used = new Set<string>();
  const outboxRows = memories.map((m) => {
    const parsed = parseMemory(m.text);
    let key = dedupeKeyFor(m.text, entries, settings, today);
    if (!key || used.has(key)) key = `recovered:${m.blobId}`;
    used.add(key);
    return {
      id: ulid(),
      shopId: books.shopId,
      namespace: m.namespace,
      kind: parsed?.kind ?? "unknown",
      customerId: parsed?.customerId ?? null,
      dedupeKey: key,
      content: m.text,
      occurredAt: new Date(parsed?.occurredAt ?? books.recoveredAt),
      demo: parsed?.demo === true,
      status: "confirmed" as const,
      blobId: m.blobId,
      confirmedAt: new Date(books.recoveredAt),
    };
  });

  // The owner's latest label override, if any, is remembered on Walrus (brief §6.2).
  // `label: null` is the owner handing the label back to the automatic rules; the latest wins either way.
  const overrides = new Map<string, { at: string; label: string | null }>();
  for (const m of memories) {
    const j = JSON.parse(m.text) as { kind?: string; customerId?: string; occurredAt?: string; label?: string | null };
    if (j.kind !== "label_override" || !j.customerId || j.label === undefined || !j.occurredAt) continue;
    const prev = overrides.get(j.customerId);
    if (!prev || prev.at < j.occurredAt) overrides.set(j.customerId, { at: j.occurredAt, label: j.label });
  }

  const hashOf = new Map(books.days.map((d) => [d.date, d.hash]));
  await db.transaction(async (tx) => {
    await tx.insert(schema.shops).values({
      id: books.shopId,
      name: books.shop.name,
      ownerName: books.shop.ownerName,
      timezone: books.shop.timezone,
      openingCashKobo: books.shop.openingCashKobo,
      defaultDueDays: books.shop.defaultDueDays,
      suiAddress: books.shop.suiAddress,
      mode: books.shop.mode,
      pinHash: opts.pin ? hashPin(opts.pin) : null,
      anchorObjectId: books.anchorId,
      anchorCapId,
    });
    const customers = Object.entries(books.directory.customers);
    if (customers.length)
      await tx.insert(schema.customers).values(
        customers.map(([id, c]) => ({ id, shopId: books.shopId, name: c.name, phone: c.phone, labelOverride: normalizeLabel(overrides.get(id)?.label) ?? null })),
      );
    const items = Object.entries(books.directory.items);
    if (items.length) await tx.insert(schema.items).values(items.map(([id, i]) => ({ id, shopId: books.shopId, name: i.name, unit: i.unit })));
    for (let i = 0; i < entries.length; i += 200) {
      await tx.insert(schema.entries).values(
        entries.slice(i, i + 200).map((e) => ({ id: e.id, shopId: e.shopId, type: e.type, occurredAt: new Date(e.occurredAt), recordedAt: new Date(e.recordedAt), customerId: "customerId" in e ? (e.customerId ?? null) : null, data: e })),
      );
    }
    let dayCount = 0;
    for (const b of books.batches) {
      dayCount += b.dates.length;
      const id = ulid();
      await tx.insert(schema.seals).values({ id, shopId: books.shopId, kind: "batch", namespace: b.namespace, fromDate: b.from, toDate: b.to, dayCount, headHash: hashOf.get(b.to)!, blobId: b.blobId, sealedAt: new Date(b.sealedAt) });
      await tx.insert(schema.sealedDays).values(b.dates.map((date) => ({ shopId: books.shopId, date, hash: hashOf.get(date)!, sealId: id })));
    }
    for (const c of books.checkpoints) {
      const r = monthRange(c.record.month);
      await tx.insert(schema.seals).values({ id: ulid(), shopId: books.shopId, kind: "month", namespace: c.namespace, fromDate: r.from, toDate: r.to, dayCount: c.record.dayCount, headHash: c.record.hash, blobId: c.blobId, sealedAt: new Date(c.record.sealedAt) });
    }
    if (outboxRows.length) await tx.insert(schema.outbox).values(outboxRows);
  });

  const recoveredKeys = outboxRows.filter((r) => !r.dedupeKey.startsWith("recovered:")).length;
  return { customers: Object.keys(books.directory.customers).length, items: Object.keys(books.directory.items).length, entries: entries.length, days: books.days.length, memories: outboxRows.length, memoriesMatched: recoveredKeys, anchorCapId, overrides: overrides.size };
}
