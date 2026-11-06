import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { tatum } from "./index";

/**
 * The shop's head anchor on Sui (brief §6.8a), using the package published in Phase 0. The server
 * key holds each AnchorCap and pays its own gas: no sponsorship needed.
 */
function serverKey(): Ed25519Keypair {
  const key = process.env.SUI_SPONSOR_PRIVATE_KEY;
  if (!key) throw new Error("SUI_SPONSOR_PRIVATE_KEY is not set");
  return Ed25519Keypair.fromSecretKey(key);
}
function packageId(): string {
  const id = process.env.ANCHOR_PACKAGE_ID;
  if (!id) throw new Error("ANCHOR_PACKAGE_ID is not set");
  return id;
}

async function execute(tx: Transaction, key: Ed25519Keypair) {
  tx.setSender(key.toSuiAddress());
  const bytes = await tx.build({ client: tatum() });
  const { signature } = await key.signTransaction(bytes);
  const res = await tatum().core.executeTransaction({ transaction: bytes, signatures: [signature], include: { effects: true, objectTypes: true } });
  if (res.$kind !== "Transaction") throw new Error(`anchor transaction failed: ${JSON.stringify(res.FailedTransaction.effects?.status).slice(0, 200)}`);
  await tatum().core.waitForTransaction({ digest: res.Transaction.digest });
  return res.Transaction;
}

/** Creates a shop's HeadAnchor (shared) and its AnchorCap (kept by the server key). */
export async function createAnchor(shopId: string): Promise<{ anchorId: string; capId: string; digest: string }> {
  const key = serverKey();
  const tx = new Transaction();
  const cap = tx.moveCall({ target: `${packageId()}::anchor::create`, arguments: [tx.pure.vector("u8", [...Buffer.from(shopId)])] });
  tx.transferObjects([cap], key.toSuiAddress());
  const done = await execute(tx, key);
  const created = done.effects!.changedObjects.filter((o) => o.idOperation === "Created").map((o) => o.objectId);
  const anchorId = created.find((id) => done.objectTypes?.[id]?.endsWith("::anchor::HeadAnchor"));
  const capId = created.find((id) => done.objectTypes?.[id]?.endsWith("::anchor::AnchorCap"));
  if (!anchorId || !capId) throw new Error("anchor or cap not found in transaction effects");
  return { anchorId, capId, digest: done.digest };
}

/**
 * Finds the AnchorCap the server key holds for an anchor, read through Tatum. Used after recovery,
 * when the app database that remembered the cap id is gone.
 */
export async function findAnchorCap(anchorId: string): Promise<string | null> {
  const owner = serverKey().toSuiAddress();
  let after: string | null = null;
  for (;;) {
    const r: unknown = await tatum().query({
      query: `query($owner: SuiAddress!, $type: String!, $after: String) { address(address: $owner) { objects(filter: { type: $type }, after: $after) { pageInfo { hasNextPage endCursor } nodes { address contents { json } } } } }`,
      variables: { owner, type: `${packageId()}::anchor::AnchorCap`, after },
    } as never);
    type Page = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { address: string; contents?: { json?: { anchor_id?: string } } }[] };
    const page: Page | undefined = (r as { data?: { address?: { objects?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { address: string; contents?: { json?: { anchor_id?: string } } }[] } } } }).data?.address?.objects;
    if (!page) throw new Error(`Tatum returned no objects for ${owner}: ${JSON.stringify((r as { errors?: unknown }).errors ?? r).slice(0, 300)}`);
    const hit = page.nodes.find((n) => n.contents?.json?.anchor_id === anchorId);
    if (hit) return hit.address;
    if (!page.pageInfo.hasNextPage) return null;
    after = page.pageInfo.endCursor;
  }
}

/** Publishes the newest sealed day: the contract rejects a day count that does not increase. */
export async function updateAnchor(input: { anchorId: string; capId: string; lastDay: string; headHashHex: string; dayCount: number }): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId()}::anchor::update`,
    arguments: [
      tx.object(input.anchorId),
      tx.object(input.capId),
      tx.pure.vector("u8", [...Buffer.from(input.lastDay)]),
      tx.pure.vector("u8", [...fromHex(input.headHashHex)]),
      tx.pure.u64(input.dayCount),
      tx.object.clock(),
    ],
  });
  return (await execute(tx, serverKey())).digest;
}
