import { tatum, report, hasTatumKey, TATUM_URL } from "./lib.js";

console.log(`endpoint=${TATUM_URL} auth=${hasTatumKey ? "x-api-key" : "ANONYMOUS"}`);
async function gql(name: string, query: string) {
  try {
    // any: exploratory probe of a live schema, shapes are what this script verifies
    const r = await tatum.query<Record<string, any>>({ query, variables: {} });
    if (r.errors?.length) {
      report(name, "FAIL", r.errors.map((e) => e.message));
      return null;
    }
    report(name, "PASS", r.data ?? {});
    return r.data ?? null;
  } catch (e) {
    report(name, "FAIL", String(e));
    return null;
  }
}
const cp = await gql("latest checkpoint", `{chainIdentifier checkpoint{sequenceNumber digest timestamp transactions(first:1){nodes{digest}}}}`);
const digest = cp?.checkpoint?.transactions?.nodes?.[0]?.digest;
if (digest) {
  await gql("tx by digest + balance changes", `{transaction(digest:"${digest}"){digest effects{status balanceChanges(first:5){nodes{amount coinType{repr} owner{address}}}}}}`);
}
await gql("balance", `{address(address:"0x5"){balance(coinType:"0x2::sui::SUI"){totalBalance}}}`);
await gql("USDC metadata", `{coinMetadata(coinType:"0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"){symbol decimals}}`);
await gql("object + previousTransaction (anchor read shape)", `{object(address:"0x6"){version digest previousTransaction{digest}}}`);
await gql("events query", `{events(first:1){nodes{timestamp}}}`);
