// Read-only: compares the configured delegate key with the on-chain account. Prints public data only.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex, toHex } from "@mysten/sui/utils";
import { tatum } from "./lib.js";

const pk = toHex(Ed25519Keypair.fromSecretKey(fromHex(process.env.MEMWAL_PRIVATE_KEY!)).getPublicKey().toRawBytes());
const agent = process.env.MEMWAL_AGENT_ID!.replace(/^0x/, "").toLowerCase();
console.log("private key derives MEMWAL_AGENT_ID:", pk === agent);
console.log("derived public key:", pk);

const id = process.env.MEMWAL_ACCOUNT_ID!;
const r = await tatum.query<Record<string, any>>({ // any: probing a live object's shape
  query: `{object(address:"${id}"){address owner{__typename} asMoveObject{contents{type{repr} json}}}}`,
  variables: {},
});
console.log("errors:", r.errors?.map((e) => e.message));
const o = r.data?.object;
console.log("account object exists:", Boolean(o));
console.log("type:", o?.asMoveObject?.contents?.type?.repr ?? "(not a Move object)");
const json = o?.asMoveObject?.contents?.json;
console.log("contents:", JSON.stringify(json)?.slice(0, 900));
console.log("public key appears in account (hex or base64):",
  JSON.stringify(json ?? "").includes(pk) || JSON.stringify(json ?? "").includes(Buffer.from(pk, "hex").toString("base64")));

const sponsor = Ed25519Keypair.fromSecretKey(process.env.SUI_SPONSOR_PRIVATE_KEY!).toSuiAddress();
console.log("sponsor address:", sponsor);
const USDC = process.env.USDC_COIN_TYPE!;
const b = await tatum.query<Record<string, any>>({
  query: `{address(address:"${sponsor}"){sui:balance(coinType:"0x2::sui::SUI"){totalBalance} usdc:balance(coinType:"${USDC}"){totalBalance}}}`,
  variables: {},
});
console.log("sponsor balances (minor units):", JSON.stringify(b.data?.address), b.errors?.map((e) => e.message) ?? "");
