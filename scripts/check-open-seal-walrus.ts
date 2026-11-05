// Path A over the open Seal servers, using a test record. No embedding provider and no API key.
// write:           seal locally (either server can decrypt), then store through the relayer.
// list <ns>:       find blob IDs by namespace (this mode uses the relayer).
// read <blob> [server]: decrypt with no relayer, from the blob ID and account credentials alone.
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { MemWalManual } from "@mysten-incubation/memwal/manual";
import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { report, requireEnv, sleep, tatum } from "./lib.js";

requireEnv("open Seal on Walrus", "MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID");

const PACKAGE_ID = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const REGISTRY_ID = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space";
const RELAYER = process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz";
const accountId = process.env.MEMWAL_ACCOUNT_ID!;
const raw = process.env.MEMWAL_PRIVATE_KEY!;
const signer = Ed25519Keypair.fromSecretKey(raw.startsWith("suiprivkey") ? raw : fromHex(raw));
const VECTOR_SIZE = Number(process.env.VECTOR_SIZE || 1536);

/** A unit vector derived from a hash, so record text never reaches an embedding provider. */
function hashVector(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; out.length < VECTOR_SIZE; i++) {
    const h = createHash("sha256").update(`${i}:${text}`).digest();
    for (let j = 0; j + 4 <= h.length && out.length < VECTOR_SIZE; j += 4) out.push(h.readInt32LE(j) / 2 ** 31);
  }
  const norm = Math.hypot(...out);
  return out.map((v) => v / norm);
}

const [mode, arg, serverName] = process.argv.slice(2);

if (mode === "write") {
  const namespace = `trustbook:spike:open-seal:${Date.now()}`;
  const manual = MemWalManual.create({
    key: raw,
    suiPrivateKey: signer.getSecretKey(),
    embeddingApiKey: "not-used",
    packageId: PACKAGE_ID,
    registryId: REGISTRY_ID,
    accountId,
    serverUrl: RELAYER,
    sealThreshold: 1,
    namespace,
  });
  (manual as any).embed = async (text: string) => hashVector(text);
  const text = `TRUSTBOOK-DAY open-seal-test 2026-11-05\n${JSON.stringify({ v: 1, demo: true, note: "Path A test record" })}`;
  const t0 = Date.now();
  const res = await manual.rememberManual(text, namespace);
  report("sealed record stored through relayer", res.blob_id ? "PASS" : "FAIL", { blob: res.blob_id, ms: Date.now() - t0 });
  console.log(`NAMESPACE=${namespace}`);
  console.log(`BLOB=${res.blob_id}`);
} else if (mode === "list" && arg) {
  const m = MemWal.create({ key: raw, accountId, namespace: arg, serverUrl: RELAYER });
  const page = await m.listMemories({ namespace: arg });
  report("found by namespace", page.memories.length ? "PASS" : "FAIL", page.memories.map((x) => ({ blob: x.blob_id, status: x.status })));
} else if (mode === "read" && arg) {
  let resp: Response | undefined;
  for (let i = 0; i < 12; i++) {
    resp = await fetch(`${AGGREGATOR}/v1/blobs/${arg}`);
    if (resp.ok) break;
    await sleep(10_000);
  }
  if (!resp?.ok) {
    report("download from Walrus aggregator", "FAIL", `HTTP ${resp?.status}`);
    process.exit(1);
  }
  const data = new Uint8Array(await resp.arrayBuffer());
  const parsed = EncryptedObject.parse(data);
  report("download from Walrus aggregator", "PASS", { bytes: data.length, threshold: parsed.threshold, servers: parsed.services.map(([id]) => id.slice(0, 10)) });
  const OPEN: Record<string, string> = {
    Overclock: "0x145540d931f182fef76467dd8074c9839aea126852d90d18e1556fcbbd1208b6",
    "Studio Mirai": "0xe0eb52eba9261b96e895bbb4deca10dcd64fbc626a1133017adcd5131353fd10",
  };
  const chosen = serverName ? [OPEN[serverName]!] : Object.values(OPEN);
  const seal = new SealClient({
    suiClient: tatum as never,
    serverConfigs: chosen.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: true,
  });
  const sessionKey = await SessionKey.create({
    address: signer.toSuiAddress(),
    packageId: PACKAGE_ID,
    ttlMin: 5,
    signer,
    suiClient: tatum as never,
  });
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::account::seal_approve`,
    arguments: [tx.pure.vector("u8", [...fromHex(parsed.id)]), tx.object(REGISTRY_ID), tx.object(accountId)],
  });
  const txBytes = await tx.build({ client: tatum, onlyTransactionKind: true });
  await seal.fetchKeys({ ids: [parsed.id], txBytes, sessionKey, threshold: parsed.threshold });
  const plain = new TextDecoder().decode(await seal.decrypt({ data, sessionKey, txBytes }));
  report(`decrypted with no relayer (${serverName ?? "any server"})`, plain.startsWith("TRUSTBOOK-DAY open-seal-test") ? "PASS" : "FAIL", plain.split("\n")[0]);
} else {
  console.log("usage: write | list <namespace> | read <blob-id> [server]");
}
