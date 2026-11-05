// Live mainnet proof: anchor create, sponsored anchor update, Tatum read-back, sponsored USDC payment.
// Spends real gas. The cap and the test USDC both return to the sponsor wallet.
// Usage: tsx scripts/check-anchor-and-payment.ts <package-id> <sender-key-file>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { report, requireEnv, tatum } from "./lib.js";

requireEnv("anchor and payment", "SUI_SPONSOR_PRIVATE_KEY", "USDC_COIN_TYPE");
const [pkg, keyFile] = process.argv.slice(2);
if (!pkg || !keyFile) throw new Error("usage: check-anchor-and-payment.ts <package-id> <sender-key-file>");

const USDC = process.env.USDC_COIN_TYPE!;
const USDC_TEST_AMOUNT = 50_000n; // 0.05 USDC
const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!);
if (!existsSync(keyFile)) writeFileSync(keyFile, new Ed25519Keypair().getSecretKey());
const sender = Ed25519Keypair.fromSecretKey(readFileSync(keyFile, "utf8").trim());
const sponsorAddr = sponsor.toSuiAddress();
const senderAddr = sender.toSuiAddress();
const include = { effects: true, objectTypes: true } as const;

async function run(label: string, tx: Transaction, signers: Ed25519Keypair[]) {
  const bytes = await tx.build({ client: tatum });
  const signatures = await Promise.all(signers.map(async (s) => (await s.signTransaction(bytes)).signature));
  const res = await tatum.core.executeTransaction({ transaction: bytes, signatures, include });
  if (res.$kind !== "Transaction") {
    report(label, "FAIL", res.FailedTransaction.effects!.status);
    process.exit(1);
  }
  const done = res.Transaction;
  await tatum.core.waitForTransaction({ digest: done.digest });
  const g = done.effects!.gasUsed;
  const net = BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
  report(label, "PASS", { digest: done.digest, netGasMist: net.toString() });
  return done;
}

function sponsored(tx: Transaction) {
  tx.setSender(senderAddr);
  tx.setGasOwner(sponsorAddr);
  return tx;
}

// 1. Create a test anchor. The cap goes to the temporary sender so the update can be truly sponsored.
const createTx = new Transaction();
createTx.setSender(sponsorAddr);
const cap = createTx.moveCall({
  target: `${pkg}::anchor::create`,
  arguments: [createTx.pure.vector("u8", [...Buffer.from("phase0-test")])],
});
createTx.transferObjects([cap], senderAddr);
const created = await run("anchor create", createTx, [sponsor]);
const createdIds = created.effects!.changedObjects.filter((o) => o.idOperation === "Created").map((o) => o.objectId);
const anchorId = createdIds.find((id) => created.objectTypes?.[id]?.endsWith("::anchor::HeadAnchor"));
const capId = createdIds.find((id) => created.objectTypes?.[id]?.endsWith("::anchor::AnchorCap"));
if (!anchorId || !capId) throw new Error(`anchor or cap not found in ${JSON.stringify(created.objectTypes)}`);
console.log(JSON.stringify({ anchorId, capId, senderAddr }));

// 2. Sponsored update: sender holds the cap, sponsor pays gas, and the cap returns to the sponsor.
const lastDay = "2026-11-05";
const headHash = "ab".repeat(32);
const updateTx = sponsored(new Transaction());
updateTx.moveCall({
  target: `${pkg}::anchor::update`,
  arguments: [
    updateTx.object(anchorId),
    updateTx.object(capId),
    updateTx.pure.vector("u8", [...Buffer.from(lastDay)]),
    updateTx.pure.vector("u8", [...Buffer.from(headHash, "hex")]),
    updateTx.pure.u64(1),
    updateTx.object.clock(),
  ],
});
updateTx.transferObjects([updateTx.object(capId)], sponsorAddr);
const updated = await run("sponsored anchor update", updateTx, [sender, sponsor]);

// 3. Read back through Tatum and compare against what was written.
const read = await tatum.query({
  query: `query($id: SuiAddress!) { object(address: $id) { previousTransaction { digest } asMoveObject { contents { json } } } }`,
  variables: { id: anchorId },
} as never);
const obj = (read as any).data?.object;
const json = obj?.asMoveObject?.contents?.json;
const b64 = (s: string) => Buffer.from(s).toString("base64");
const matches =
  obj?.previousTransaction?.digest === updated.digest &&
  json?.last_day === b64(lastDay) &&
  json?.head_hash === Buffer.from(headHash, "hex").toString("base64") &&
  String(json?.day_count) === "1";
report("anchor read back through Tatum", matches ? "PASS" : "FAIL", { previous: obj?.previousTransaction?.digest, json });

// 4. Fund the sender with test USDC, then make a sponsored payment back to the sponsor wallet.
const fundTx = new Transaction();
fundTx.setSender(sponsorAddr);
fundTx.transferObjects([coinWithBalance({ type: USDC, balance: USDC_TEST_AMOUNT, useGasCoin: false })], senderAddr);
await run("fund test sender with USDC", fundTx, [sponsor]);

const payTx = sponsored(new Transaction());
payTx.transferObjects([coinWithBalance({ type: USDC, balance: USDC_TEST_AMOUNT, useGasCoin: false })], sponsorAddr);
await run("sponsored USDC payment", payTx, [sender, sponsor]);

const left = await tatum.core.getBalance({ owner: senderAddr, coinType: USDC });
report("test sender USDC returned", left.balance.balance === "0" ? "PASS" : "FAIL", left.balance.balance);
