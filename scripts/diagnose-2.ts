// Read-only follow-up: what is MEMWAL_ACCOUNT_ID, and what does a non-empty balance change look like?
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { tatum } from "./lib.js";

const id = process.env.MEMWAL_ACCOUNT_ID!;
const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!).toSuiAddress();
console.log("account id equals sponsor address:", id.toLowerCase() === sponsor.toLowerCase());
const reg = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";
const pkg = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const a = await tatum.query<Record<string, any>>({ // any: probing live shapes
  query: `{address(address:"${id}"){balance(coinType:"0x2::sui::SUI"){totalBalance} objects(first:30){nodes{contents{type{repr}}}}}}`,
  variables: {},
});
const types: string[] = (a.data?.address?.objects?.nodes ?? []).map((n: any) => n.contents?.type?.repr);
console.log("id as an address: SUI =", a.data?.address?.balance?.totalBalance, "| objects:", types.length, a.errors?.map((e) => e.message) ?? "");
console.log("owned memwal-package objects:", types.filter((t) => t?.startsWith(pkg)));
const r = await tatum.query<Record<string, any>>({
  query: `{object(address:"${reg}"){asMoveObject{contents{type{repr}}}}}`, variables: {},
});
console.log("relayer registry type:", r.data?.object?.asMoveObject?.contents?.type?.repr);
const t = await tatum.query<Record<string, any>>({
  query: `{transactions(last:5,filter:{affectedAddress:"${sponsor}"}){nodes{digest effects{status balanceChanges(first:3){nodes{amount coinType{repr} owner{address}}}}}}}`,
  variables: {},
});
console.log("balance change sample:", JSON.stringify(t.data?.transactions?.nodes?.find((n: any) => n.effects.balanceChanges.nodes.length)), t.errors?.map((e) => e.message) ?? "");
