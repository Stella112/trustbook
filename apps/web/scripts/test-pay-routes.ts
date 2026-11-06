// Live test of the pay page's HTTP routes (quote → build → sign → submit) against the running app,
// signing as the customer's wallet would. Funds the test customer from the sponsor and returns leftovers.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { tatum, USDC_COIN_TYPE } from "@trustbook/chain";
import { DEMO_SHOP_ID } from "../src/seed/demo";

const [keyFile, base = "http://localhost:3100", naira = "50"] = process.argv.slice(2);
const { signPayLink } = await import("../src/lib/paylink");
const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!);
const customer = Ed25519Keypair.fromSecretKey(readFileSync(keyFile!, "utf8").trim());
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};
async function run(tx: Transaction, signers: Ed25519Keypair[]) {
  const bytes = await tx.build({ client: tatum() });
  const signatures = await Promise.all(signers.map(async (s) => (await s.signTransaction(bytes)).signature));
  const res = await tatum().core.executeTransaction({ transaction: bytes, signatures });
  if (res.$kind !== "Transaction") throw new Error("tx failed");
  await tatum().core.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction.digest;
}
const usdcOf = async (owner: string) => Number((await tatum().core.getBalance({ owner, coinType: USDC_COIN_TYPE })).balance.balance);

const token = signPayLink({ shopId: DEMO_SHOP_ID, customerId: "cust-tunde", amountKobo: Number(naira) * 100 });
const quote = await post("/api/pay/quote", { token });
console.log("quote:", JSON.stringify(quote));
const need = Math.round(Number(quote.usdc) * 1_000_000);
const fund = new Transaction();
fund.setSender(sponsor.toSuiAddress());
fund.transferObjects([coinWithBalance({ type: USDC_COIN_TYPE, balance: BigInt(need), useGasCoin: false })], customer.toSuiAddress());
console.log("funded:", await run(fund, [sponsor]));
const built = await post("/api/pay/build", { quoteId: quote.quoteId, sender: customer.toSuiAddress() });
const { signature } = await customer.signTransaction(fromBase64(built.bytes));
const done = await post("/api/pay/submit", { quoteId: quote.quoteId, signature });
console.log("submit:", JSON.stringify(done));
try {
  await post("/api/pay/submit", { quoteId: quote.quoteId, signature });
  console.log("second submit accepted (bad)");
} catch (e) {
  console.log("second submit refused:", (e as Error).message.slice(0, 120));
}
const left = await usdcOf(customer.toSuiAddress());
console.log("customer USDC left:", left);
