import { SuiGraphQLClient } from "@mysten/sui/graphql";

// The only module in Trustbook that calls Tatum or Sui (brief §3.1). All Sui reads go through Tatum.

// Shared request pacer (brief §4.2: "~2 req/s with retries + backoff"). Tatum's free tier answers
// bursts with HTTP 429; on Vercel one Walrus read sends about seven Sui reads at once and every
// one came back 429 (6 Nov). Requests leave at most every MIN_GAP_MS, and a 429 is retried after
// Retry-After or a growing wait.
const MIN_GAP_MS = 350;
const MAX_429_RETRIES = 5;
let nextSlot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await sleep(at - now);
}

const pacedFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    await waitForSlot();
    const res = await fetch(input, init);
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt);
  }
};

let client: SuiGraphQLClient | undefined;
export function tatum(): SuiGraphQLClient {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) throw new Error("TATUM_API_KEY is not set");
  return (client ??= new SuiGraphQLClient({
    url: process.env.TATUM_SUI_GRAPHQL_URL || "https://sui-mainnet.gateway.tatum.io/graphql",
    network: "mainnet",
    headers: { "x-api-key": apiKey },
    fetch: pacedFetch,
  }));
}

export interface Checkpoint {
  sequenceNumber: string;
  digest: string;
  timestamp: string;
}

/** The latest Sui checkpoint as Tatum sees it; the query shape was verified live in Phase 0. */
export async function latestCheckpoint(): Promise<Checkpoint> {
  const r = await tatum().query({ query: `{ checkpoint { sequenceNumber digest timestamp } }` } as never);
  const cp = (r as { data?: { checkpoint?: Checkpoint } }).data?.checkpoint;
  if (!cp) throw new Error("Tatum returned no checkpoint");
  return cp;
}

export interface AnchorState {
  /** The shop id the anchor was created for, so recovery can refuse another shop's anchor. */
  shopId: string;
  lastDay: string;
  headHash: string;
  dayCount: string;
  updatedMs: string;
  lastTxDigest: string | null;
}

/** Reads a shop's HeadAnchor object through Tatum (shape verified live on 5 Nov). */
export async function readAnchor(objectId: string): Promise<AnchorState | null> {
  const r = await tatum().query({
    query: `query($id: SuiAddress!) { object(address: $id) { previousTransaction { digest } asMoveObject { contents { json } } } }`,
    variables: { id: objectId },
  } as never);
  const o = (r as { data?: { object?: { previousTransaction?: { digest: string }; asMoveObject?: { contents?: { json?: Record<string, string> } } } } }).data?.object;
  const j = o?.asMoveObject?.contents?.json;
  if (!j) return null;
  const text = (b64: string) => Buffer.from(b64, "base64").toString("utf8");
  return { shopId: text(j.shop_id ?? ""), lastDay: text(j.last_day ?? ""), headHash: Buffer.from(j.head_hash ?? "", "base64").toString("hex"), dayCount: String(j.day_count), updatedMs: String(j.updated_ms), lastTxDigest: o?.previousTransaction?.digest ?? null };
}

export * from "./payments";
export * from "./anchor";
export * from "./swap";
