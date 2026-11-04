// Phase 0 spike. seal: writes 3 chained test day records, printing only the namespace.
// rebuild <namespace>: takes nothing else, then rediscovers and verifies them from Walrus.
import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { report, requireEnv } from "./lib.js";

requireEnv("recovery spike", "MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID");
const client = (namespace: string) => MemWal.create({
  key: process.env.MEMWAL_PRIVATE_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, namespace,
  serverUrl: process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz",
});
type Day = { v: 1; demo: true; shopId: string; date: string; entries: { id: string; amountKobo: number }[]; prevHash: string; hash?: string };
const canon = (o: unknown): string => Array.isArray(o) ? `[${o.map(canon).join(",")}]`
  : o && typeof o === "object" ? `{${Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canon(v)}`).join(",")}}`
  : JSON.stringify(o);
const hashOf = ({ hash: _omit, ...r }: Day) => createHash("sha256").update(canon(r)).digest("hex");
const SHOP = "spike";
const DATES = ["2026-10-01", "2026-10-02", "2026-10-03"];
const header = (d: string) => `TRUSTBOOK-DAY ${SHOP} ${d}`;

const [mode, arg] = process.argv.slice(2);
if (mode === "seal") {
  const namespace = `trustbook:spike:ledger:${Date.now()}`;
  const m = client(namespace);
  let prev = "GENESIS";
  for (const [i, date] of DATES.entries()) {
    const rec: Day = { v: 1, demo: true, shopId: SHOP, date, entries: [{ id: `e${i}`, amountKobo: (i + 1) * 100_000 }], prevHash: prev };
    rec.hash = hashOf(rec);
    const t0 = Date.now();
    const done = await m.rememberAndWait(`${header(date)}\n${JSON.stringify(rec)}`);
    report(`sealed ${date}`, done.blob_id ? "PASS" : "FAIL", { blob: done.blob_id, ms: Date.now() - t0 });
    prev = rec.hash;
  }
  console.log(`NAMESPACE=${namespace}`);
} else if (mode === "rebuild" && arg) {
  const m = client(arg);
  const listed = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await m.listMemories({ namespace: arg, ...(cursor ? { cursor } : {}) });
    listed.push(...page.memories);
    if (!page.has_more) break;
    cursor = page.next_cursor ?? undefined;
  }
  report("discovery via listMemories", listed.length === 3 ? "PASS" : "FAIL", `${listed.length} memories`);
  console.log("restore:", JSON.stringify(await m.restore(arg, 100)));
  const days: Day[] = [];
  for (const date of DATES) {
    const { results } = await m.recall({ query: header(date), limit: 10 });
    for (const r of results) {
      const [head, body] = [r.text.slice(0, r.text.indexOf("\n")), r.text.slice(r.text.indexOf("\n") + 1)];
      if (head !== header(date)) continue;
      const rec = JSON.parse(body) as Day; // accept only an exact shop and date match, per 6.8
      if (rec.shopId === SHOP && rec.date === date) days.push(rec);
    }
  }
  report("recall by exact header", days.length === 3 ? "PASS" : "FAIL", `${days.length}/3`);
  report("hashes", days.every((d) => hashOf(d) === d.hash) ? "PASS" : "FAIL");
  report("chain", days.every((d, i) => d.prevHash === (i ? days[i - 1]!.hash : "GENESIS")) ? "PASS" : "FAIL");
  const tampered = structuredClone(days[1]!);
  tampered.entries[0]!.amountKobo += 1;
  report("tamper is detected", hashOf(tampered) !== tampered.hash ? "PASS" : "FAIL");
} else {
  console.log("usage: seal | rebuild <namespace>");
}
