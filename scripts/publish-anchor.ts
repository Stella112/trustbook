// Publishes packages/move/anchor from the sponsor key. Simulates only, unless --execute is passed.
// Usage: tsx scripts/publish-anchor.ts <bytes.json> [--execute]
// bytes.json comes from: sui move build --dump-bytecode-as-base64 -e mainnet
import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { report, requireEnv, tatum } from "./lib.js";

requireEnv("publish anchor", "SUI_SPONSOR_PRIVATE_KEY");
const [bytesPath, flag] = process.argv.slice(2);
if (!bytesPath) throw new Error("usage: publish-anchor.ts <bytes.json> [--execute]");
const execute = flag === "--execute";

const { modules, dependencies } = JSON.parse(readFileSync(bytesPath, "utf8"));
const signer = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!);
const sender = signer.toSuiAddress();

const tx = new Transaction();
tx.setSender(sender);
tx.setGasBudget(Number(process.env.PUBLISH_GAS_BUDGET || 20_000_000));
const upgradeCap = tx.publish({ modules, dependencies });
tx.transferObjects([upgradeCap], sender);

const bytes = await tx.build({ client: tatum });
const include = { effects: true, objectTypes: true } as const;
const sim = await tatum.core.simulateTransaction({ transaction: bytes, include });
const simTx = sim.$kind === "Transaction" ? sim.Transaction : sim.FailedTransaction;
const gas = simTx.effects!.gasUsed;
const net = BigInt(gas.computationCost) + BigInt(gas.storageCost) - BigInt(gas.storageRebate);
console.log(JSON.stringify({ sender, status: simTx.effects!.status, gas, netMist: net.toString() }));
if (sim.$kind !== "Transaction") {
  report("publish simulation", "FAIL", simTx.effects!.status);
  process.exit();
}
report("publish simulation", "PASS", `net ${net} MIST`);
if (!execute) process.exit(0);

const { signature } = await signer.signTransaction(bytes);
const res = await tatum.core.executeTransaction({ transaction: bytes, signatures: [signature], include });
if (res.$kind !== "Transaction") {
  report("publish", "FAIL", res.FailedTransaction.effects!.status);
  process.exit();
}
const done = res.Transaction;
const created = done.effects!.changedObjects
  .filter((o) => o.idOperation === "Created")
  .map((o) => ({ id: o.objectId, type: done.objectTypes?.[o.objectId] }));
report("publish", "PASS", { digest: done.digest, gas: done.effects!.gasUsed, created });
