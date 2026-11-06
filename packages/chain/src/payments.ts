import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { fromBase64, normalizeStructTag, normalizeSuiAddress, toBase64 } from "@mysten/sui/utils";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { tatum } from "./index";

/** Native USDC on Sui (Circle), verified on-chain in Phase 0. */
export const USDC_COIN_TYPE = process.env.USDC_COIN_TYPE || "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export const sponsorAddress = () => sponsor().toSuiAddress();

function sponsor(): Ed25519Keypair {
  const key = process.env.SUI_SPONSOR_PRIVATE_KEY;
  if (!key) throw new Error("SUI_SPONSOR_PRIVATE_KEY is not set");
  return Ed25519Keypair.fromSecretKey(key);
}

/** USDC→NGN through Tatum's data API (verified in Phase 0). The rate stays a decimal string. */
export async function usdcNgnRate(): Promise<{ rate: string; source: string }> {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) throw new Error("TATUM_API_KEY is not set");
  const r = await fetch("https://api.tatum.io/v4/data/rate/symbol?symbol=USDC&basePair=NGN", { headers: { "x-api-key": apiKey } });
  if (!r.ok) throw new Error(`rate request failed: HTTP ${r.status}`);
  const j = (await r.json()) as { value?: string; source?: string };
  if (!j.value || !/^\d+(\.\d+)?$/.test(j.value)) throw new Error("rate missing from Tatum response");
  return { rate: j.value, source: j.source ?? "Tatum" };
}

/**
 * Builds a USDC transfer from the customer to the shop with gas paid by the sponsor (brief §6.5 step 3–4).
 * Returns the bytes for the customer's wallet to sign and the digest the payment must have.
 */
export async function buildSponsoredUsdcTransfer(input: { sender: string; recipient: string; amountMicro: number }): Promise<{ bytes: string; digest: string }> {
  const s = sponsor();
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddress(input.sender));
  tx.setGasOwner(s.toSuiAddress());
  tx.transferObjects([coinWithBalance({ type: USDC_COIN_TYPE, balance: BigInt(input.amountMicro), useGasCoin: false })], normalizeSuiAddress(input.recipient));
  const bytes = await tx.build({ client: tatum() });
  return { bytes: toBase64(bytes), digest: TransactionDataBuilder.getDigestFromBytes(bytes) };
}

/**
 * Checks the customer's signature, adds the sponsor's, and executes through Tatum. The sponsor only
 * signs bytes the server built itself, so it can never be made to pay for anything else.
 */
export async function executeSponsored(bytesB64: string, customerSignature: string, customerAddress: string): Promise<string> {
  const bytes = fromBase64(bytesB64);
  await verifyTransactionSignature(bytes, customerSignature, { address: normalizeSuiAddress(customerAddress) });
  const { signature } = await sponsor().signTransaction(bytes);
  const res = await tatum().core.executeTransaction({ transaction: bytes, signatures: [customerSignature, signature], include: { effects: true } });
  if (res.$kind !== "Transaction") throw new Error(`payment failed on chain: ${JSON.stringify(res.FailedTransaction.effects?.status).slice(0, 200)}`);
  await tatum().core.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction.digest;
}

export interface PaymentCheck {
  ok: boolean;
  reason?: string;
  receivedMicro: number;
  checkpointTimestamp?: string;
}

/**
 * Verifies a payment by digest through Tatum (brief §6.5 step 5): the transaction succeeded and its
 * balance changes credit the shop with at least the required amount of USDC. Shape verified in Phase 0.
 */
export async function verifyUsdcPayment(digest: string, recipient: string, requiredMicro: number): Promise<PaymentCheck> {
  const r = await tatum().query({
    query: `query($d: String!) { transaction(digest: $d) { effects { status timestamp balanceChanges(first: 50) { nodes { amount coinType { repr } owner { address } } } } } }`,
    variables: { d: digest },
  } as never);
  const effects = (r as { data?: { transaction?: { effects?: { status?: string; timestamp?: string; balanceChanges?: { nodes: { amount: string; coinType: { repr: string }; owner: { address: string } | null }[] } } } } }).data?.transaction?.effects;
  if (!effects) return { ok: false, reason: "Transaction not found through Tatum", receivedMicro: 0 };
  if (String(effects.status).toUpperCase() !== "SUCCESS") return { ok: false, reason: `Transaction status ${effects.status}`, receivedMicro: 0 };
  const shop = normalizeSuiAddress(recipient);
  const usdc = normalizeStructTag(USDC_COIN_TYPE);
  const received = (effects.balanceChanges?.nodes ?? [])
    .filter((n) => n.owner && normalizeSuiAddress(n.owner.address) === shop && normalizeStructTag(n.coinType.repr) === usdc)
    .reduce((s, n) => s + BigInt(n.amount), 0n);
  const receivedMicro = Number(received);
  if (received < BigInt(requiredMicro)) return { ok: false, reason: `Shop received ${receivedMicro} micro-USDC, needed ${requiredMicro}`, receivedMicro, checkpointTimestamp: effects.timestamp };
  return { ok: true, receivedMicro, checkpointTimestamp: effects.timestamp };
}
