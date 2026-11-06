import { buildSponsoredSwapPayment, buildSponsoredUsdcTransfer, executeSponsored, isUsdc, swapRouteToUsdc, swappableBalances, USDC_COIN_TYPE, usdcNgnRate, verifyUsdcPayment } from "@trustbook/chain";
import { computeDebts, effectiveEntries, instantAt, koboToUsdcMicro, localDate, localTime, proposeAllocations, validateEntry } from "@trustbook/ledger";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db, schema } from "../db/client";
import { readPayLink } from "../lib/paylink";
import { queueMemoriesForSaved } from "../memory/events";

const QUOTE_MINUTES = 30;

export class PayError extends Error {}

async function shopAndCustomer(shopId: string, customerId: string) {
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), eq(schema.customers.shopId, shopId)));
  if (!shop || !customer) throw new PayError("This pay link is not valid.");
  return { shop, customer };
}

/** Step 1: lock a rate for 30 minutes and work out the USDC amount. */
export async function createQuote(token: string) {
  const link = readPayLink(token);
  if (!link) throw new PayError("This pay link has expired or is not valid. Ask the shop for a new one.");
  const { shop } = await shopAndCustomer(link.shopId, link.customerId);
  if (!shop.suiAddress) throw new PayError("This shop has not set up Sui payments yet.");
  const { rate } = await usdcNgnRate();
  const usdcMicro = koboToUsdcMicro(link.amountKobo, rate);
  const [q] = await db
    .insert(schema.payQuotes)
    .values({ id: ulid(), shopId: shop.id, customerId: link.customerId, saleId: link.saleId ?? null, amountKobo: link.amountKobo, usdcMicro, rate, recipient: shop.suiAddress, expiresAt: new Date(Date.now() + QUOTE_MINUTES * 60_000) })
    .returning();
  return q!;
}

async function liveQuote(quoteId: string) {
  const [q] = await db.select().from(schema.payQuotes).where(eq(schema.payQuotes.id, quoteId));
  if (!q) throw new PayError("Payment not found.");
  if (q.status === "paid") throw new PayError("This payment is already complete.");
  if (q.expiresAt < new Date()) throw new PayError("This price has expired. Please start again for a fresh rate.");
  return q;
}

/** Tokens in the customer's wallet that can be swapped to USDC for this payment (brief P1). */
export async function payableTokens(quoteId: string, sender: string) {
  if (!isValidSuiAddress(sender)) throw new PayError("That wallet address is not valid.");
  await liveQuote(quoteId);
  return swappableBalances(sender);
}

/** About how much of a token pays this debt, from a live route. The shop still gets the exact USDC. */
export async function estimateSwap(quoteId: string, coinType: string) {
  const q = await liveQuote(quoteId);
  const route = await swapRouteToUsdc(coinType, q.usdcMicro);
  return { coinType, amountIn: route.coinIn.amount.toString() };
}

/**
 * Step 2: build the exact sponsored transaction for the customer's wallet to sign. With a token other
 * than USDC, it is swapped to USDC in the same transaction and the shop receives the exact amount.
 */
export async function buildForQuote(quoteId: string, sender: string, coinType?: string) {
  if (!isValidSuiAddress(sender)) throw new PayError("That wallet address is not valid.");
  const q = await liveQuote(quoteId);
  const swap = coinType && !isUsdc(coinType);
  const built = swap
    ? await buildSponsoredSwapPayment({ sender, recipient: q.recipient, usdcMicro: q.usdcMicro, coinInType: coinType })
    : await buildSponsoredUsdcTransfer({ sender, recipient: q.recipient, amountMicro: q.usdcMicro });
  const { bytes, digest } = built;
  await db.update(schema.payQuotes).set({ sender: normalizeSuiAddress(sender), txBytes: bytes, expectedDigest: digest, status: "built" }).where(eq(schema.payQuotes.id, quoteId));
  return { bytes, digest, coinInAmount: "coinInAmount" in built ? built.coinInAmount : null };
}

/**
 * Step 3: sponsor and execute, verify through Tatum, then record the payment once (brief §6.5 steps 5–6).
 * Only the transaction the server built can be executed, so the sponsor pays for nothing else.
 */
export async function submitForQuote(quoteId: string, signature: string) {
  const q = await liveQuote(quoteId);
  if (q.status !== "built" || !q.txBytes || !q.sender || !q.expectedDigest) throw new PayError("Please connect your wallet again.");
  let digest: string;
  try {
    digest = await executeSponsored(q.txBytes, signature, q.sender);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.payQuotes).set({ status: "failed", error: message.slice(0, 500) }).where(eq(schema.payQuotes.id, quoteId));
    throw new PayError(/insufficient|balance/i.test(message) ? "Your wallet does not have enough for this payment." : /slippage|EAmount|split/i.test(message) ? "The price moved while you were paying. Nothing was taken. Please try again." : "The payment did not go through. Nothing was taken. Please try again.");
  }
  if (digest !== q.expectedDigest) throw new PayError("The payment does not match what was prepared.");
  return recordVerified(quoteId, digest);
}

/** Verifies through Tatum and records the PAYMENT entry; safe to call twice for the same digest. */
export async function recordVerified(quoteId: string, digest: string) {
  const [q] = await db.select().from(schema.payQuotes).where(eq(schema.payQuotes.id, quoteId));
  if (!q) throw new PayError("Payment not found.");
  if (q.status === "paid" && q.digest === digest) return { quote: q, entryId: q.entryId! };
  const check = await verifyUsdcPayment(digest, q.recipient, q.usdcMicro);
  if (!check.ok) throw new PayError(`Payment could not be verified: ${check.reason}`);

  const { shop } = await shopAndCustomer(q.shopId, q.customerId);
  const rows = await db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt));
  const entries = rows.map((r) => validateEntry(r.data));
  const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  const nowIso = new Date().toISOString();
  const today = localDate(nowIso, shop.timezone);
  const now = instantAt(today, localTime(nowIso, shop.timezone), shop.timezone);
  const debts = computeDebts(effectiveEntries(entries), settings, today);
  const entry = validateEntry({
    id: ulid(),
    shopId: shop.id,
    occurredAt: now,
    recordedAt: now,
    source: "payment",
    confirmedBy: "sui",
    type: "PAYMENT",
    customerId: q.customerId,
    amountKobo: q.amountKobo,
    method: "sui",
    allocations: proposeAllocations(debts, q.customerId, q.amountKobo, q.saleId ?? undefined),
    verification: { digest, coinType: USDC_COIN_TYPE, amountMinor: check.receivedMicro, rateUsed: q.rate },
  });
  // The unique digest index means a second attempt with the same transaction cannot record twice.
  await db.transaction(async (tx) => {
    await tx.update(schema.payQuotes).set({ status: "paid", digest, entryId: entry.id, paidAt: new Date(), error: null }).where(eq(schema.payQuotes.id, quoteId));
    await tx.insert(schema.entries).values({ id: entry.id, shopId: shop.id, type: "PAYMENT", occurredAt: new Date(entry.occurredAt), recordedAt: new Date(entry.recordedAt), customerId: q.customerId, data: entry });
  });
  await queueMemoriesForSaved(shop, [entry]);
  const [paid] = await db.select().from(schema.payQuotes).where(eq(schema.payQuotes.id, quoteId));
  return { quote: paid!, entryId: entry.id };
}
