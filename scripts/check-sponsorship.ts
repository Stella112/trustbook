// Self-sponsor proof with throwaway keys: offline build, two signatures, both verified. Nothing is broadcast.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { report } from "./lib.js";

const sender = new Ed25519Keypair();
const sponsor = new Ed25519Keypair();
const tx = new Transaction();
tx.setSender(sender.toSuiAddress());
tx.setGasOwner(sponsor.toSuiAddress());
tx.setGasPrice(1000);
tx.setGasBudget(5_000_000);
// Placeholder gas ref: enough to prove byte construction. A real coin ref is needed to execute.
tx.setGasPayment([{ objectId: "0x" + "ab".repeat(32), version: "1", digest: "11111111111111111111111111111111" }]);
tx.transferObjects([tx.gas], sender.toSuiAddress());
const bytes = await tx.build();
const a = await sender.signTransaction(bytes);
const b = await sponsor.signTransaction(bytes);
await verifyTransactionSignature(bytes, a.signature, { address: sender.toSuiAddress() });
await verifyTransactionSignature(bytes, b.signature, { address: sponsor.toSuiAddress() });
report("sponsored tx built and dual-signed offline", "PASS", `${bytes.length} bytes; NOT broadcast`);
