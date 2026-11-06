import { coinWithBalance, Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress, toBase64 } from "@mysten/sui/utils";
import { Aftermath, AftermathApi, type Router, type RouterCompleteTradeRoute } from "aftermath-ts-sdk";
import { tatum } from "./index";
import { sponsorAddress, USDC_COIN_TYPE } from "./payments";

/**
 * Pay with any Sui token (brief P1, approved 6 Nov). The customer's token is swapped to USDC inside
 * the same sponsored transaction through the Aftermath router, and the shop receives exactly the
 * quoted USDC. Chosen over Cetus (pins its own copy of @mysten/sui 2.31) and 7K (@mysten/sui v1):
 * aftermath-ts-sdk 6.4.0 accepts @mysten/sui >=2 <3, so its Transaction is the same class as ours.
 */
export const SWAP_SLIPPAGE = 0.01; // 1%, the router API takes a fraction
const MARGIN_PERCENT = 2n; // ask for 2 × slippage more USDC, in whole percent (integer money maths)

let routerPromise: Promise<Router> | undefined;
/**
 * The router, wired so that every Sui call goes through Tatum (brief §4.2). Aftermath's own setup
 * makes a client for a public fullnode; instead we hand it an `AftermathApi` whose client is our
 * Tatum GraphQL client. The router only uses that client to serialise our transaction
 * (`tx.build({ onlyTransactionKind: true })`, read in the SDK source), which the core API covers.
 */
function aftermath(): Promise<Router> {
  return (routerPromise ??= (async () => {
    const bootstrap = await Aftermath.create({ network: "MAINNET", api: {} as AftermathApi });
    const addresses = await bootstrap.getAddresses();
    // The SDK types this as its gRPC client; our GraphQL client implements the same core API.
    const api = new AftermathApi(tatum() as unknown as ConstructorParameters<typeof AftermathApi>[0], addresses);
    return (await Aftermath.create({ network: "MAINNET", api })).Router();
  })().catch((err) => {
    routerPromise = undefined;
    throw err;
  }));
}

export const isUsdc = (coinType: string) => normalizeStructTag(coinType) === normalizeStructTag(USDC_COIN_TYPE);

/**
 * The route for exactly `usdcMicro` out, asked with a margin of twice the slippage. The router
 * guarantees at least (asked × (1 − slippage)), which stays above `usdcMicro`; the transaction then
 * splits off exactly `usdcMicro` for the shop and returns the rest of the USDC to the customer.
 */
export async function swapRouteToUsdc(coinInType: string, usdcMicro: number): Promise<RouterCompleteTradeRoute> {
  if (isUsdc(coinInType)) throw new Error("USDC needs no swap");
  const asked = (BigInt(usdcMicro) * (100n + MARGIN_PERCENT) + 99n) / 100n; // rounded up
  return (await aftermath()).getCompleteTradeRouteGivenAmountOut({
    coinInType: normalizeStructTag(coinInType),
    coinOutType: normalizeStructTag(USDC_COIN_TYPE),
    coinOutAmount: asked,
    slippage: SWAP_SLIPPAGE,
  });
}

/** Tokens the customer holds that the router can swap, with display details. */
export async function swappableBalances(owner: string): Promise<{ coinType: string; symbol: string; decimals: number; balance: string }[]> {
  const [supported, balances] = await Promise.all([(await aftermath()).getSupportedCoins(), tatum().core.listBalances({ owner: normalizeSuiAddress(owner) })]);
  const ok = new Set(supported.map((t) => normalizeStructTag(t)));
  const held = balances.balances.filter((b) => BigInt(b.balance) > 0n && !isUsdc(b.coinType) && ok.has(normalizeStructTag(b.coinType)));
  return Promise.all(
    held.map(async (b) => {
      const meta = (await tatum().core.getCoinMetadata({ coinType: b.coinType })).coinMetadata;
      return { coinType: normalizeStructTag(b.coinType), symbol: meta?.symbol ?? b.coinType.split("::").at(-1) ?? "?", decimals: meta?.decimals ?? 9, balance: b.balance };
    }),
  );
}

/**
 * Builds: take the route's input from the customer's token (never the sponsor's gas coin) → swap →
 * exactly `usdcMicro` USDC to the shop → leftover USDC back to the customer. Gas is paid by the
 * sponsor. If the swap returns less than `usdcMicro`, the split aborts and nothing moves.
 */
export async function buildSponsoredSwapPayment(input: { sender: string; recipient: string; usdcMicro: number; coinInType: string }): Promise<{ bytes: string; digest: string; coinInAmount: string }> {
  const sender = normalizeSuiAddress(input.sender);
  const route = await swapRouteToUsdc(input.coinInType, input.usdcMicro);
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasOwner(sponsorAddress());
  const coinIn = coinWithBalance({ type: normalizeStructTag(input.coinInType), balance: route.coinIn.amount, useGasCoin: false });
  const { tx: swapped, coinOutId } = await (await aftermath()).addTransactionForCompleteTradeRoute({
    tx,
    completeRoute: route,
    slippage: SWAP_SLIPPAGE,
    walletAddress: sender,
    isSponsoredTx: true,
    coinInId: coinIn,
  });
  if (!coinOutId) throw new Error("the router returned no USDC coin to pay with");
  // The router hands back a new transaction rebuilt from the transaction kind, which carries no gas
  // owner: without this the customer would pay gas (seen in the 6 Nov dry run).
  swapped.setSender(sender);
  swapped.setGasOwner(sponsorAddress());
  const [payment] = swapped.splitCoins(coinOutId, [BigInt(input.usdcMicro)]);
  swapped.transferObjects([payment!], normalizeSuiAddress(input.recipient));
  swapped.transferObjects([coinOutId], sender);
  const bytes = await swapped.build({ client: tatum() });
  return { bytes: toBase64(bytes), digest: TransactionDataBuilder.getDigestFromBytes(bytes), coinInAmount: route.coinIn.amount.toString() };
}

/** Dry-runs built bytes through Tatum: nothing is signed or executed. */
export async function simulatePayment(bytesB64: string) {
  const bytes = Uint8Array.from(Buffer.from(bytesB64, "base64"));
  return tatum().core.simulateTransaction({ transaction: bytes, include: { effects: true, balanceChanges: true } });
}
