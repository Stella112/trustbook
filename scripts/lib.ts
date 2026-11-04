import "dotenv/config";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

export const TATUM_URL = process.env.TATUM_SUI_GRAPHQL_URL || "https://sui-mainnet.gateway.tatum.io/graphql";
export const hasTatumKey = Boolean(process.env.TATUM_API_KEY);
// Anonymous gateway limit observed live: 5 req/min. Keyed target from the brief: ~2 req/s.
const PACE_MS = hasTatumKey ? 500 : 13_000;
let last = 0;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pacedFetch: typeof fetch = async (input, init) => {
  const wait = last + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  return fetch(input, init);
};
export const tatum = new SuiGraphQLClient({
  url: TATUM_URL,
  network: "mainnet",
  fetch: pacedFetch,
  ...(hasTatumKey ? { headers: { "x-api-key": process.env.TATUM_API_KEY! } } : {}),
});
export type Status = "PASS" | "FAIL" | "SKIPPED";
export function report(name: string, status: Status, detail: unknown = "") {
  console.log(`${status.padEnd(8)}${name}  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  if (status === "FAIL") process.exitCode = 1;
}
/** Prints SKIPPED and exits cleanly when the credentials a live check needs are absent. */
export function requireEnv(check: string, ...names: string[]) {
  const m = names.filter((n) => !process.env[n]);
  if (m.length) {
    report(check, "SKIPPED", `missing env: ${m.join(", ")}`);
    process.exit(0);
  }
}
