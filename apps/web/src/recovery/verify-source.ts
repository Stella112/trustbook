import { readAnchor, tatum } from "@trustbook/chain";
import { listAllNamespaces, listBlobIds, readSealedMany } from "@trustbook/memory";
import { decodeSealed, type Sealed } from "@trustbook/recovery-core";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";

/**
 * The read-only source behind the public /verify page (brief §6.8a). It hands the browser the
 * sealed records exactly as read from Walrus, plus the anchor as read through Tatum; the browser
 * runs the checks itself. Keys never leave the server. Only DEMO shops are served, and phone
 * numbers are removed (they are not part of any fingerprint).
 */
export interface VerifyIndex {
  shopId: string;
  shopName: string;
  anchorId: string;
  anchor: { lastDay: string; headHash: string; dayCount: number; lastTxDigest: string | null } | null;
  anchorError?: string;
  blobs: { blobId: string; namespace: string }[];
}

const INDEX_TTL_MS = 2 * 60_000;
let indexCache: { at: number; shopId: string; value: VerifyIndex } | undefined;
// Walrus blobs never change, so a read blob can be kept for the life of the server process.
const blobCache = new Map<string, Sealed>();

async function demoShop(shopId: string) {
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  if (!shop || shop.mode !== "DEMO") throw new Error("only the demo shop can be verified publicly");
  if (!shop.anchorObjectId) throw new Error("this shop has not been sealed yet");
  return { ...shop, anchorObjectId: shop.anchorObjectId };
}

export async function verifyIndex(shopId: string): Promise<VerifyIndex> {
  if (indexCache && indexCache.shopId === shopId && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.value;
  const shop = await demoShop(shopId);
  const prefix = `trustbook:${shopId}:ledger:`;
  const namespaces = (await listAllNamespaces()).filter((n) => n.name.startsWith(prefix)).map((n) => n.name).sort();
  const blobs: VerifyIndex["blobs"] = [];
  for (const namespace of namespaces) for (const blobId of await listBlobIds(namespace)) blobs.push({ blobId, namespace });
  let anchor: VerifyIndex["anchor"] = null;
  let anchorError: string | undefined;
  try {
    const a = await readAnchor(shop.anchorObjectId);
    if (!a) anchorError = "anchor not found on Sui";
    else if (a.shopId !== shopId) anchorError = `anchor belongs to shop "${a.shopId}"`;
    else anchor = { lastDay: a.lastDay, headHash: a.headHash, dayCount: Number(a.dayCount), lastTxDigest: a.lastTxDigest };
  } catch (err) {
    anchorError = `anchor read failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
  }
  const value: VerifyIndex = { shopId, shopName: shop.name, anchorId: shop.anchorObjectId, anchor, anchorError, blobs };
  indexCache = { at: Date.now(), shopId, value };
  return value;
}

export interface VerifyRecords {
  records: { blobId: string; sealed: Sealed }[];
  problems: string[];
}

/** Every sealed record of the shop, read from Walrus in one batch (one key request). */
export async function verifyRecords(shopId: string): Promise<VerifyRecords> {
  const index = await verifyIndex(shopId);
  const missing = index.blobs.map((b) => b.blobId).filter((id) => !blobCache.has(id));
  const problems: string[] = [];
  if (missing.length) {
    for (const r of await readSealedMany(missing, tatum())) {
      const decoded = r.text === undefined ? null : decodeSealed(r.text);
      if (r.text === undefined) problems.push(`blob ${r.blobId} could not be read: ${r.error}`);
      else if (!decoded || decoded.record.shopId !== shopId) problems.push(`blob ${r.blobId} is not a record of this shop`);
      else blobCache.set(r.blobId, decoded);
    }
  }
  const records: VerifyRecords["records"] = [];
  for (const b of index.blobs) {
    const sealed = blobCache.get(b.blobId);
    if (!sealed) continue;
    if (sealed.kind !== "batch") {
      records.push({ blobId: b.blobId, sealed });
      continue;
    }
    const customers = Object.fromEntries(Object.entries(sealed.record.directory.customers).map(([id, c]) => [id, { name: c.name, phone: null }]));
    records.push({ blobId: b.blobId, sealed: { kind: "batch", record: { ...sealed.record, directory: { ...sealed.record.directory, customers } } } });
  }
  return { records, problems };
}
