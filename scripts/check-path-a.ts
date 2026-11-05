// Path A: read one sealed record with no relayer and no embedding key.
// Downloads the blob from a Walrus aggregator, gets Seal keys, and decrypts locally. Sends no transaction.
// Usage: tsx scripts/check-path-a.ts <blob-id>
import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { report, requireEnv, tatum } from "./lib.js";

requireEnv("path A", "MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID", "SEAL_API_KEY");
const blobId = process.argv[2];
if (!blobId) throw new Error("usage: check-path-a.ts <blob-id>");

// Pinned from the relayer's /config so this run never calls the relayer.
const PACKAGE_ID = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const REGISTRY_ID = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space";

const raw = process.env.MEMWAL_PRIVATE_KEY!;
const signer = Ed25519Keypair.fromSecretKey(raw.startsWith("suiprivkey") ? raw : fromHex(raw));

const resp = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
if (!resp.ok) {
  report("download from Walrus aggregator", "FAIL", `HTTP ${resp.status}`);
  process.exit(1);
}
const data = new Uint8Array(await resp.arrayBuffer());
report("download from Walrus aggregator", "PASS", `${data.length} bytes`);

const parsed = EncryptedObject.parse(data);
report("blob is a Seal object for the Walrus Memory package", parsed.packageId === PACKAGE_ID ? "PASS" : "FAIL", parsed.packageId);

const seal = new SealClient({
  suiClient: tatum as never,
  serverConfigs: parsed.services.map(([objectId, weight]) => ({
    objectId,
    weight,
    aggregatorUrl: "https://seal-aggregator-mainnet.mystenlabs.com",
    apiKeyName: "X-API-Key",
    apiKey: process.env.SEAL_API_KEY!,
  })),
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
  arguments: [
    tx.pure.vector("u8", [...fromHex(parsed.id)]),
    tx.object(REGISTRY_ID),
    tx.object(process.env.MEMWAL_ACCOUNT_ID!),
  ],
});
const txBytes = await tx.build({ client: tatum, onlyTransactionKind: true });
await seal.fetchKeys({ ids: [parsed.id], txBytes, sessionKey, threshold: parsed.threshold });
const plain = new TextDecoder().decode(await seal.decrypt({ data, sessionKey, txBytes }));
report("decrypted with no relayer or embedding key", plain.startsWith("TRUSTBOOK-DAY") ? "PASS" : "FAIL", plain.split("\n")[0]);
