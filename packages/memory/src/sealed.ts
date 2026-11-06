import { randomBytes } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { MemWalManual } from "@mysten-incubation/memwal/manual";
import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";

/**
 * Recovery Mode storage (Gate 0 decision, approved 6 Nov): ledger records are sealed with the open
 * Seal key servers (either one can release the key), so they can be read back from a Walrus
 * aggregator with only the account's delegate key: no relayer, no API key, no embedding provider.
 * Proven live on 5 Nov (docs/VERIFIED.md, "Path A over open servers").
 */

// Pinned from the relayer's /config, so reading never needs the relayer.
const PACKAGE_ID = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const REGISTRY_ID = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const OPEN_SERVERS = [
  "0x145540d931f182fef76467dd8074c9839aea126852d90d18e1556fcbbd1208b6", // Overclock
  "0xe0eb52eba9261b96e895bbb4deca10dcd64fbc626a1133017adcd5131353fd10", // Studio Mirai
];
const AGGREGATORS = ["https://aggregator.walrus-mainnet.walrus.space", "https://wal-aggregator-mainnet.staketab.org"];
const VECTOR_SIZE = 1536;

interface Creds {
  key: string;
  accountId: string;
  relayer: string;
}
function creds(): Creds {
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error("MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be set");
  return { key, accountId, relayer: process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz" };
}
const keypair = (key: string) => Ed25519Keypair.fromSecretKey(key.startsWith("suiprivkey") ? key : fromHex(key));

/** A random unit vector: ledger records are found by listing, never by search, so nothing about them is embedded. */
function randomVector(): number[] {
  const b = randomBytes(VECTOR_SIZE * 4);
  const v = Array.from({ length: VECTOR_SIZE }, (_, i) => b.readInt32LE(i * 4) / 2 ** 31);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

/**
 * Seals text locally to the open key servers and stores it through the relayer's manual path.
 * Returns the blob id once Walrus confirms the write (about 25–35 seconds).
 */
export async function writeSealed(text: string, namespace: string, suiClient: unknown): Promise<string> {
  const c = creds();
  const manual = MemWalManual.create({
    key: c.key,
    suiPrivateKey: keypair(c.key).getSecretKey(),
    embeddingApiKey: "not-used",
    packageId: PACKAGE_ID,
    registryId: REGISTRY_ID,
    accountId: c.accountId,
    serverUrl: c.relayer,
    sealThreshold: 1,
    namespace,
    suiClient,
  });
  // The SDK's embed step is replaced: see randomVector. `embed` is internal to the SDK class.
  (manual as unknown as { embed: () => Promise<number[]> }).embed = async () => randomVector();
  const res = await manual.rememberManual(text, namespace);
  if (!res.blob_id) throw new Error("Walrus did not return a blob id");
  return res.blob_id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries a call that may hit the Tatum free tier's rate limit (HTTP 429) or a brief outage. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(1500 * 2 ** i);
    }
  }
  throw last;
}

async function download(blobId: string): Promise<Uint8Array> {
  for (const agg of AGGREGATORS) {
    const r = await fetch(`${agg}/v1/blobs/${blobId}`).catch(() => null);
    if (r?.ok) return new Uint8Array(await r.arrayBuffer());
  }
  throw new Error(`blob ${blobId} not available from any aggregator`);
}

export interface ReadResult {
  blobId: string;
  text?: string;
  error?: string;
}

/**
 * Downloads sealed blobs from public aggregators and decrypts them. Uses no relayer. Keys for all
 * blobs are fetched in ONE request with one session key, as the Seal SDK recommends; this keeps the
 * number of Tatum calls small enough for the free tier. Each blob gets its own text or error.
 */
export async function readSealedMany(blobIds: readonly string[], suiClient: unknown): Promise<ReadResult[]> {
  const results = new Map<string, ReadResult>();
  const fail = (blobId: string, err: unknown) => results.set(blobId, { blobId, error: err instanceof Error ? err.message : String(err) });
  const parsed: { blobId: string; data: Uint8Array; id: string; threshold: number; servers: string[] }[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < blobIds.length) {
        const blobId = blobIds[next++]!;
        try {
          const data = await withRetry(() => download(blobId), 3);
          const obj = EncryptedObject.parse(data);
          if (obj.packageId !== PACKAGE_ID) throw new Error(`blob ${blobId} is not a Walrus Memory record`);
          const servers = obj.services.map(([id]) => id).filter((id) => OPEN_SERVERS.includes(id));
          if (!servers.length) throw new Error(`blob ${blobId} was not sealed to the open key servers`);
          parsed.push({ blobId, data, id: obj.id, threshold: obj.threshold, servers });
        } catch (err) {
          fail(blobId, err);
        }
      }
    }),
  );
  if (parsed.length) {
    try {
      const c = creds();
      const signer = keypair(c.key);
      const servers = [...new Set(parsed.flatMap((p) => p.servers))];
      const seal = new SealClient({ suiClient: suiClient as never, serverConfigs: servers.map((objectId) => ({ objectId, weight: 1 })), verifyKeyServers: true });
      const sessionKey = await withRetry(() => SessionKey.create({ address: signer.toSuiAddress(), packageId: PACKAGE_ID, ttlMin: 10, signer, suiClient: suiClient as never }));
      const tx = new Transaction();
      for (const id of new Set(parsed.map((p) => p.id))) {
        tx.moveCall({ target: `${PACKAGE_ID}::account::seal_approve`, arguments: [tx.pure.vector("u8", [...fromHex(id)]), tx.object(REGISTRY_ID), tx.object(c.accountId)] });
      }
      const txBytes = await withRetry(() => tx.build({ client: suiClient as never, onlyTransactionKind: true }));
      const threshold = Math.max(...parsed.map((p) => p.threshold));
      await withRetry(() => seal.fetchKeys({ ids: [...new Set(parsed.map((p) => p.id))], txBytes, sessionKey, threshold }));
      for (const p of parsed) {
        try {
          results.set(p.blobId, { blobId: p.blobId, text: new TextDecoder().decode(await seal.decrypt({ data: p.data, sessionKey, txBytes })) });
        } catch (err) {
          fail(p.blobId, err);
        }
      }
    } catch (err) {
      for (const p of parsed) if (!results.has(p.blobId)) fail(p.blobId, err);
    }
  }
  return blobIds.map((blobId) => results.get(blobId) ?? { blobId, error: "not read" });
}

/** Downloads one sealed blob and decrypts it. Uses no relayer. */
export async function readSealed(blobId: string, suiClient: unknown): Promise<string> {
  const [r] = await readSealedMany([blobId], suiClient);
  if (r?.text === undefined) throw new Error(r?.error ?? `blob ${blobId} could not be read`);
  return r.text;
}

function listClient(namespace = "trustbook"): MemWal {
  const c = creds();
  return MemWal.create({ key: c.key, accountId: c.accountId, serverUrl: c.relayer, namespace });
}

/** Every namespace of the account with its memory count (discovery and behaviour counts). */
export async function listAllNamespaces(): Promise<{ name: string; count: number }[]> {
  const m = listClient();
  const out: { name: string; count: number }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await m.listNamespaces(cursor ? { cursor } : {});
    out.push(...page.namespaces.map((n) => ({ name: n.name, count: n.memory_count })));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return out;
}

export interface SealedBlob {
  namespace: string | null;
  blobId: string;
  text: string;
}

/**
 * Finds and reads every sealed ledger blob of a shop (brief §6.8 recovery, Path A read).
 * Discovery lists the account's `trustbook:<shopId>:ledger:*` namespaces through the relayer; when
 * the relayer is down, pass the blob ids instead (they are printed on /proof). Reading itself never
 * uses the relayer. Blobs that cannot be read are returned as problems, never skipped silently.
 */
export async function loadSealedBlobs(shopId: string, suiClient: unknown, opts: { blobIds?: string[]; log?: (l: string) => void } = {}): Promise<{ blobs: SealedBlob[]; problems: string[] }> {
  const log = opts.log ?? (() => {});
  let targets: { namespace: string | null; blobId: string }[];
  if (opts.blobIds?.length) targets = opts.blobIds.map((blobId) => ({ namespace: null, blobId }));
  else {
    const prefix = `trustbook:${shopId}:ledger:`;
    const namespaces = (await listAllNamespaces()).filter((n) => n.name.startsWith(prefix)).map((n) => n.name).sort();
    log(`found ${namespaces.length} ledger namespace(s): ${namespaces.join(", ") || "none"}`);
    targets = [];
    for (const namespace of namespaces) for (const blobId of await listBlobIds(namespace)) targets.push({ namespace, blobId });
  }
  const blobs: SealedBlob[] = [];
  const problems: string[] = [];
  const read = await readSealedMany(targets.map((t) => t.blobId), suiClient);
  read.forEach((r, i) => {
    const t = targets[i]!;
    if (r.text === undefined) problems.push(`blob ${t.blobId} could not be read: ${r.error}`);
    else {
      blobs.push({ ...t, text: r.text });
      log(`read blob ${t.blobId}${t.namespace ? ` (${t.namespace})` : ""}`);
    }
  });
  return { blobs, problems };
}

/** Active blob ids in one namespace, paging through the whole inventory. */
export async function listBlobIds(namespace: string): Promise<string[]> {
  const m = listClient(namespace);
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await m.listMemories({ namespace, ...(cursor ? { cursor } : {}) });
    ids.push(...page.memories.filter((x) => x.status === "active").map((x) => x.blob_id));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return ids;
}
