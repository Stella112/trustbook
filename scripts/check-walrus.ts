import { MemWal } from "@mysten-incubation/memwal";
import { report, requireEnv } from "./lib.js";

requireEnv("walrus write/recall/restore", "MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID");
const namespace = `trustbook:phase0:${Date.now()}`;
const m = MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY!,
  accountId: process.env.MEMWAL_ACCOUNT_ID!,
  namespace,
  serverUrl: process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz",
});
const marker = `TRUSTBOOK-CHECK ${namespace}`;
const t0 = Date.now();
const job = await m.remember(marker);
const done = await m.waitForRememberJob(job.job_id);
report("remember confirmed", done.blob_id ? "PASS" : "FAIL", { blob: done.blob_id, ms: Date.now() - t0 });
const rec = await m.recall({ query: marker, limit: 10 });
report("recall finds it", rec.results.some((r) => r.text === marker) ? "PASS" : "FAIL", rec.results.map((r) => r.distance));
console.log("recall limit=500:", await m.recall({ query: marker, limit: 500 }).then((r) => `accepted, ${r.results.length} results`, (e) => `rejected: ${e}`));
console.log("restore limit=500:", await m.restore(namespace, 500).catch((e) => `rejected: ${e}`));
const page = await m.listMemories({ namespace });
report("listMemories", page.memories.length ? "PASS" : "FAIL", page.memories[0] ?? {});
