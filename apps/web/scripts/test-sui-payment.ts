// Live mainnet test of the pay flow (brief Phase 4): a temporary customer wallet pays a ₦ pay link in USDC
// with sponsored gas, through the same service the pay page uses. The shop's address is the sponsor
// wallet, so the test USDC returns to it; any leftover in the customer wallet is sent back too.
// Usage: tsx scripts/test-sui-payment.ts <customer-key-file> [amountNaira=100]
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { tatum, USDC_COIN_TYPE } from "@trustbook/chain";
import { eq } from "drizzle-orm";
import { DEMO_SHOP_ID } from "../src/seed/demo";

const [keyFile, nairaArg = "100"] = process.argv.slice(2);
if (!keyFile) throw new Error("usage: test-sui-payment.ts <customer-key-file> [amountNaira]");
const { db, closeDb, schema } = await import("../src/db/client");
const { signPayLink } = await import("../src/lib/paylink");
const { createQuote, buildForQuote, submitForQuote } = await import("../src/pay/service");
const { processOutbox } = await import("../src/memory/outbox");

const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!);
if (!existsSync(keyFile)) writeFileSync(keyFile, new Ed25519Keypair().getSecretKey());
const customer = Ed25519Keypair.fromSecretKey(readFileSync(keyFile, "utf8").trim());
const usdcOf = async (owner: string) => Number((await tatum().core.getBalance({ owner, coinType: USDC_COIN_TYPE })).balance.balance);

async function run(tx: Transaction, signers: Ed25519Keypair[]) {
  const bytes = await tx.build({ client: tatum() });
  const signatures = await Promise.all(signers.map(async (s) => (await s.signTransaction(bytes)).signature));
  const res = await tatum().core.executeTransaction({ transaction: bytes, signatures, include: { effects: true } });
  if (res.$kind !== "Transaction") throw new Error(JSON.stringify(res.FailedTransaction.effects?.status));
  await tatum().core.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction.digest;
}

// The demo shop receives Sui payments at the sponsor wallet, so test money comes back.
await db.update(schema.shops).set({ suiAddress: sponsor.toSuiAddress() }).where(eq(schema.shops.id, DEMO_SHOP_ID));

const amountKobo = Number(nairaArg) * 100;
const token = signPayLink({ shopId: DEMO_SHOP_ID, customerId: "cust-tunde", amountKobo });
const quote = await createQuote(token);
console.log(`quote ${quote.id}: ₦${nairaArg} = ${quote.usdcMicro} micro-USDC at ${quote.rate} NGN/USDC`);

if ((await usdcOf(customer.toSuiAddress())) < quote.usdcMicro) {
  const fund = new Transaction();
  fund.setSender(sponsor.toSuiAddress());
  fund.transferObjects([coinWithBalance({ type: USDC_COIN_TYPE, balance: BigInt(quote.usdcMicro + 5_000), useGasCoin: false })], customer.toSuiAddress());
  console.log("funded customer:", await run(fund, [sponsor]));
}
const before = await usdcOf(sponsor.toSuiAddress());

const built = await buildForQuote(quote.id, customer.toSuiAddress());
const { signature } = await customer.signTransaction(fromBase64(built.bytes));
const paid = await submitForQuote(quote.id, signature);
console.log("PAID:", JSON.stringify({ digest: paid.quote.digest, expected: built.digest, entryId: paid.entryId, status: paid.quote.status }));
console.log("shop USDC change:", (await usdcOf(sponsor.toSuiAddress())) - before, "micro (expected", quote.usdcMicro + ")");

// Second submit with the same quote must not record twice.
try {
  await submitForQuote(quote.id, signature);
  console.log("SECOND SUBMIT: recorded again (bad)");
} catch (err) {
  console.log("second submit refused:", (err as Error).message);
}

// Return any leftover USDC to the sponsor, gas sponsored.
const left = await usdcOf(customer.toSuiAddress());
if (left > 0) {
  const back = new Transaction();
  back.setSender(customer.toSuiAddress());
  back.setGasOwner(sponsor.toSuiAddress());
  back.transferObjects([coinWithBalance({ type: USDC_COIN_TYPE, balance: BigInt(left), useGasCoin: false })], sponsor.toSuiAddress());
  console.log(`returned ${left} micro-USDC:`, await run(back, [customer, sponsor]));
}
console.log("memory outbox:", JSON.stringify(await processOutbox(60_000)));
await closeDb();
