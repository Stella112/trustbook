/**
 * Trustbook recovery tool (brief §6.8, §6.8a). Rebuilds a shop's books from Walrus and proves them
 * against the head anchor on Sui, read through Tatum. It never touches the app database: it does not
 * import from apps/web, and DATABASE_URL is removed from its environment before anything runs.
 *
 *   pnpm --filter @trustbook/recovery-tool recover -- --shop <id> --anchor <objectId> --out <dir>
 *     [--env <path to .env>] [--blobs <file with one blob id per line>]
 *
 * Needs MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID and TATUM_API_KEY (MEMWAL_RELAYER_URL optional).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";

const { values: args } = parseArgs({
  options: {
    shop: { type: "string" },
    anchor: { type: "string" },
    out: { type: "string", default: "./recovered" },
    env: { type: "string" },
    blobs: { type: "string" },
  },
});
if (args.env) config({ path: resolve(args.env), quiet: true });
// Proof of independence: whatever the environment holds, this tool cannot reach the app database.
delete process.env.DATABASE_URL;

const { readAnchor, tatum } = await import("@trustbook/chain");
const { loadSealedBlobs, listAllNamespaces, recallMemories, restoreNamespace } = await import("@trustbook/memory");
const { classifyBlobs, formatReport, ledgerNamespace, verifyRecovery } = await import("@trustbook/recovery-core");
type RecoveredBooks = import("@trustbook/recovery-core").RecoveredBooks;
type RecoveredMemory = import("@trustbook/recovery-core").RecoveredMemory;

const shopId = args.shop;
if (!shopId) {
  console.error("--shop <id> is required");
  process.exit(2);
}
for (const v of ["MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID", "TATUM_API_KEY"]) {
  if (!process.env[v]) {
    console.error(`${v} is not set (pass --env <file> or set it in the environment)`);
    process.exit(2);
  }
}
const log = (l: string) => console.log(`  ${l}`);
const runAt = new Date().toISOString();
const outDir = resolve(args.out!);

console.log(`Trustbook recovery for ${shopId} — app database: not used`);

// 1. Discovery and reading, straight from Walrus.
console.log("Reading sealed records from Walrus…");
const blobIds = args.blobs ? readFileSync(resolve(args.blobs), "utf8").split(/\s+/).filter(Boolean) : undefined;
const loaded = await loadSealedBlobs(shopId, tatum(), { blobIds, log });
const { batches, checkpoints, problems } = classifyBlobs(shopId, loaded.blobs);
const discoveryProblems = [...loaded.problems, ...problems];

// 2. The anchor, read through Tatum.
let anchor: Parameters<typeof verifyRecovery>[0]["anchor"] = null;
let anchorError: string | undefined;
if (!args.anchor) anchorError = "no --anchor given";
else {
  console.log(`Reading the Sui anchor ${args.anchor} through Tatum…`);
  try {
    const a = await readAnchor(args.anchor);
    if (!a) anchorError = `anchor ${args.anchor} not found`;
    else if (a.shopId !== shopId) anchorError = `anchor ${args.anchor} belongs to shop "${a.shopId}", not "${shopId}"`;
    else anchor = { lastDay: a.lastDay, headHash: a.headHash, dayCount: Number(a.dayCount), lastTxDigest: a.lastTxDigest };
  } catch (err) {
    anchorError = `anchor read failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  // A wrong or unreadable anchor is a failure to prove completeness, not a reason to skip it quietly.
  if (anchorError) discoveryProblems.push(anchorError);
}

// 8 (input). Behaviour memory: rebuild the index for each month from Walrus, then count.
console.log("Restoring behaviour memory from Walrus…");
const latest = [...checkpoints].sort((a, b) => (a.record.month < b.record.month ? -1 : 1)).at(-1)?.record;
const prefix = `trustbook:${shopId}:behaviour:`;
let behaviourFound: Record<string, number> | null = null;
const memories: RecoveredMemory[] = [];
try {
  const listed = (await listAllNamespaces()).filter((n) => n.name.startsWith(prefix)).map((n) => n.name);
  const namespaces = [...new Set([...listed, ...Object.keys(latest?.behaviourCounts ?? {})])].sort();
  behaviourFound = {};
  for (const ns of namespaces) {
    const r = await restoreNamespace(ns);
    behaviourFound[ns] = r.found;
    log(`${ns}: ${r.found} memories on Walrus${r.failed ? `, ${r.failed} unreadable` : ""}${r.truncated ? " (restore still truncated)" : ""}`);
    // Recall with the namespace's whole size returns every memory in it, with text and blob id.
    const recalled = await recallMemories("customer credit payment promise label lesson", [ns], 100);
    memories.push(...recalled.map((m) => ({ namespace: ns, blobId: m.blobId, text: m.text })));
  }
} catch (err) {
  behaviourFound = null;
  console.error(`  behaviour memory check failed: ${err instanceof Error ? err.message : String(err)}`);
}

// 3–8. The proof itself, in the shared package (the same code /verify runs).
const result = verifyRecovery({ shopId, batches, checkpoints, anchor, anchorError, behaviourFound, discoveryProblems });
const report = formatReport(result, result.shop?.name ?? shopId, runAt);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.md"), `\`\`\`\n${report}\n\`\`\`\n`);
if (result.shop) {
  const books: RecoveredBooks = {
    v: 1,
    shopId,
    recoveredAt: runAt,
    ok: result.ok,
    anchorId: anchor ? args.anchor! : null,
    shop: result.shop,
    directory: result.directory,
    entries: result.entries,
    days: result.days.map((d) => ({ date: d.date, hash: d.hash })),
    batches: batches
      .map((b) => ({ blobId: b.blobId, namespace: ledgerNamespace(shopId, b.record.to.slice(0, 7)), from: b.record.from, to: b.record.to, sealedAt: b.record.sealedAt, dates: b.record.days.map((d) => d.date) }))
      .sort((a, b) => (a.from < b.from ? -1 : 1)),
    checkpoints: checkpoints.map((c) => ({ blobId: c.blobId, namespace: ledgerNamespace(shopId, c.record.month), record: c.record })),
  };
  writeFileSync(join(outDir, "ledger.json"), JSON.stringify(books, null, 2));
  writeFileSync(join(outDir, "memories.json"), JSON.stringify(memories, null, 2));
}

console.log("");
console.log(report);
console.log("");
console.log(`Wrote ${join(outDir, "report.md")}${existsSync(join(outDir, "ledger.json")) && result.shop ? ", ledger.json and memories.json" : ""}`);
process.exit(result.ok ? 0 : 1);
