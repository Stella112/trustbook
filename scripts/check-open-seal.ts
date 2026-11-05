// Tests the SDK's default open Seal servers with no API key, using the SDK's id layout.
// Encrypts locally, then decrypts through a fresh client with keys fetched from the servers.
// Sends no transaction and stores nothing.
import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { report, requireEnv, tatum } from "./lib.js";

requireEnv("open Seal servers", "MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID");

const PACKAGE_ID = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const REGISTRY_ID = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const OPEN_SERVERS = [
  { name: "Overclock", objectId: "0x145540d931f182fef76467dd8074c9839aea126852d90d18e1556fcbbd1208b6", weight: 1 },
  { name: "Studio Mirai", objectId: "0xe0eb52eba9261b96e895bbb4deca10dcd64fbc626a1133017adcd5131353fd10", weight: 1 },
];
const accountId = process.env.MEMWAL_ACCOUNT_ID!;
const raw = process.env.MEMWAL_PRIVATE_KEY!;
const signer = Ed25519Keypair.fromSecretKey(raw.startsWith("suiprivkey") ? raw : fromHex(raw));
const client = (servers: typeof OPEN_SERVERS) =>
  new SealClient({
    suiClient: tatum as never,
    serverConfigs: servers.map(({ objectId, weight }) => ({ objectId, weight })),
    verifyKeyServers: true,
  });

const read = await tatum.query({
  query: `query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }`,
  variables: { id: accountId },
} as never);
const fields = (read as any).data?.object?.asMoveObject?.contents?.json;
const ownerHex = String(fields.owner).replace(/^0x/, "").padStart(64, "0").toLowerCase();
const counter = Buffer.alloc(8);
counter.writeBigUInt64LE(BigInt(fields.access_counter_version));
const nsHex = Buffer.from("trustbook:spike:open-seal").toString("hex");
const id = `${nsHex}${ownerHex}${counter.toString("hex")}`;

const message = `TRUSTBOOK-OPEN-SEAL-TEST ${Date.now()}`;

async function roundTrip(label: string, servers: typeof OPEN_SERVERS, threshold: number) {
  try {
    const { encryptedObject } = await client(servers).encrypt({
      threshold,
      packageId: PACKAGE_ID,
      id,
      data: new TextEncoder().encode(message),
    });
    const parsed = EncryptedObject.parse(encryptedObject);
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
    const fresh = client(servers);
    await fresh.fetchKeys({ ids: [parsed.id], txBytes, sessionKey, threshold });
    const plain = new TextDecoder().decode(await fresh.decrypt({ data: encryptedObject, sessionKey, txBytes }));
    report(label, plain === message ? "PASS" : "FAIL", `${encryptedObject.length} bytes sealed; threshold ${threshold}`);
  } catch (err) {
    report(label, "FAIL", err instanceof Error ? err.message : String(err));
  }
}

const only = process.argv[2];
if (!only) await roundTrip("both open servers, no API key", OPEN_SERVERS, 2);
for (const s of OPEN_SERVERS.filter((x) => !only || x.name === only)) await roundTrip(`${s.name} alone, no API key`, [s], 1);
