import { SuiGraphQLClient } from "@mysten/sui/graphql";

// The only module in Trustbook that calls Tatum or Sui (brief §3.1). All Sui reads go through Tatum.

let client: SuiGraphQLClient | undefined;
export function tatum(): SuiGraphQLClient {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) throw new Error("TATUM_API_KEY is not set");
  return (client ??= new SuiGraphQLClient({
    url: process.env.TATUM_SUI_GRAPHQL_URL || "https://sui-mainnet.gateway.tatum.io/graphql",
    network: "mainnet",
    headers: { "x-api-key": apiKey },
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
