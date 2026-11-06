// Live mainnet test of paying with any token (brief P1): a temporary customer wallet pays a ₦ pay link
// with SUI, swapped to USDC in the same sponsored transaction, through the same service the pay page
// uses. The demo shop receives at the sponsor wallet, so the USDC comes back; leftovers are returned.
// Usage (run it yourself; it moves real funds): tsx scripts/test-swap-payment.ts <customer-key-file> [amountNaira=100]
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { tatum, USDC_COIN_TYPE } from "@trustbook/chain";
import { DEMO_SHOP_ID } from "../src/seed/demo";

const SUI = "0x2::sui::SUI";
const [keyFile, nairaArg = "100"] = process.argv.slice(2);
if (!keyFile) throw new Error("usage: test-swap-payment.ts <customer-key-file> [amountNaira]");
const { closeDb } = await import("../src/db/client");
const { signPayLink } = await import("../src/lib/paylink");
const { createQuote, estimateSwap, buildForQuote, submitForQuote } = await import("../src/pay/service");
const { processOutbox } = await import("../src/memory/outbox");

const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!);
if (!existsSync(keyFile)) writeFileSync(keyFile, new Ed25519Keypair().getSecretKey());
const customer = Ed25519Keypair.fromSecretKey(readFileSync(keyFile, "utf8").trim());
const bal = async (owner: string, coinType: string) => BigInt((await tatum().core.getBalance({ owner, coinType })).balance.balance);

async function run(tx: Transaction, signers: Ed25519Keypair[]) {
  const bytes = await tx.build({ client: tatum() });
  const signatures = await Promise.all(signers.map(async (s) => (await s.signTransaction(bytes)).signature));
  const res = await tatum().core.executeTransaction({ transaction: bytes, signatures, include: { effects: true } });
  if (res.$kind !== "Transaction") throw new Error(JSON.stringify(res.FailedTransaction.effects?.status));
  await tatum().core.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction.digest;
}

const quote = await createQuote(signPayLink({ shopId: DEMO_SHOP_ID, customerId: "cust-tunde", amountKobo: Number(nairaArg) * 100 }));
console.log(`quote ${quote.id}: ₦${nairaArg} = ${quote.usdcMicro} micro-USDC at ${quote.rate} NGN/USDC; shop address ${quote.recipient}`);
const { amountIn } = await estimateSwap(quote.id, SUI);
console.log(`estimate: ${amountIn} MIST of SUI`);

// Fund the throwaway customer with the estimate plus 10% (prices move between quote and build).
const need = (BigInt(amountIn) * 110n) / 100n;
const have = await bal(customer.toSuiAddress(), SUI);
if (have < need) {
  const fund = new Transaction();
  fund.setSender(sponsor.toSuiAddress());
  fund.transferObjects([coinWithBalance({ type: SUI, balance: need - have, useGasCoin: false })], customer.toSuiAddress());
  console.log("funded customer:", await run(fund, [sponsor]));
}

const shopUsdcBefore = await bal(quote.recipient, USDC_COIN_TYPE);
const built = await buildForQuote(quote.id, customer.toSuiAddress(), SUI);
console.log(`built: swaps ${built.coinInAmount} MIST of SUI, digest ${built.digest}`);
const { signature } = await customer.signTransaction(fromBase64(built.bytes));
const paid = await submitForQuote(quote.id, signature);
console.log("PAID:", JSON.stringify({ digest: paid.quote.digest, expected: built.digest, entryId: paid.entryId, status: paid.quote.status }));
console.log(`shop USDC change: ${(await bal(quote.recipient, USDC_COIN_TYPE)) - shopUsdcBefore} micro (expected ${quote.usdcMicro})`);

try {
  await submitForQuote(quote.id, signature);
  console.log("SECOND SUBMIT: recorded again (bad)");
} catch (err) {
  console.log("second submit refused:", (err as Error).message);
}

// Return leftover USDC change and SUI to the sponsor, gas sponsored.
const back = new Transaction();
back.setSender(customer.toSuiAddress());
back.setGasOwner(sponsor.toSuiAddress());
const leftUsdc = await bal(customer.toSuiAddress(), USDC_COIN_TYPE);
const leftSui = await bal(customer.toSuiAddress(), SUI);
if (leftUsdc > 0n) back.transferObjects([coinWithBalance({ type: USDC_COIN_TYPE, balance: leftUsdc, useGasCoin: false })], sponsor.toSuiAddress());
if (leftSui > 0n) back.transferObjects([coinWithBalance({ type: SUI, balance: leftSui, useGasCoin: false })], sponsor.toSuiAddress());
if (leftUsdc > 0n || leftSui > 0n) console.log(`returned ${leftUsdc} micro-USDC and ${leftSui} MIST:`, await run(back, [customer, sponsor]));
console.log("memory outbox:", JSON.stringify(await processOutbox(60_000)));
await closeDb();
