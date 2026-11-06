// Learning survives the wipe (brief §6.8a). One command:
//   1. BEFORE: record every customer's advice and the month totals from the real database.
//   2. Recover the books from Walrus + the Sui anchor with tools/recovery (no database).
//   3. Import them into a FRESH, empty rehearsal database (the real one is never touched).
//   4. AFTER: ask again from the rehearsal database, print both side by side, exit 1 on any difference.
// Both sides are compared as of the last sealed day: entries recorded after it are not on Walrus yet,
// and the script says how many there are.
//   npx tsx scripts/rehearse-recovery.ts [shopId] [--customer <id>]
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: "../../.env", quiet: true });
const REHEARSAL_DB = "trustbook_rehearsal";
const { values, positionals } = parseArgs({ allowPositionals: true, options: { snapshot: { type: "string" }, customer: { type: "string" } } });
const shopId = positionals[0] ?? "demo-mama-ngozi";

interface Snapshot {
  asOf: string;
  unsealed: number;
  totalEntries: number;
  advice: Awaited<ReturnType<typeof import("../src/lib/advice").adviceFor>>[];
  months: Record<string, unknown>;
}

// ── Child mode: one snapshot from whatever DATABASE_URL points at. ─────────────────────────────
if (values.snapshot) {
  const asOf = values.snapshot;
  const { db, schema, closeDb } = await import("../src/db/client");
  const { asc, eq } = await import("drizzle-orm");
  const { computeDebts, effectiveEntries, localDate, monthSummary, validateEntry } = await import("@trustbook/ledger");
  const { adviceFor } = await import("../src/lib/advice");
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  if (!shop) throw new Error(`no shop ${shopId}`);
  const rows = await db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shopId)).orderBy(asc(schema.entries.occurredAt));
  const all = rows.map((r) => validateEntry(r.data));
  const entries = all.filter((e) => localDate(e.recordedAt, shop.timezone) <= asOf);
  const customers = await db.select().from(schema.customers).where(eq(schema.customers.shopId, shopId)).orderBy(asc(schema.customers.name));
  const settings = { shopId, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
  const debts = computeDebts(effectiveEntries(entries), settings, asOf);
  const advice = [];
  for (const c of customers) advice.push(await adviceFor({ shopId, today: asOf, debts, customerId: c.id, name: c.name, override: c.labelOverride ?? undefined }));
  const months: Snapshot["months"] = {};
  for (const m of [...new Set(entries.map((e) => localDate(e.occurredAt, shop.timezone).slice(0, 7)))].sort()) months[m] = monthSummary(entries, settings, m, asOf);
  const out: Snapshot = { asOf, unsealed: all.length - entries.length, totalEntries: entries.length, advice, months };
  console.log(`SNAPSHOT ${JSON.stringify(out)}`);
  await closeDb();
  process.exit(0);
}

// ── Parent mode. ───────────────────────────────────────────────────────────────────────────────
const realUrl = process.env.DATABASE_URL;
if (!realUrl) throw new Error("DATABASE_URL is not set");
const rehearsalUrl = (() => {
  const u = new URL(realUrl);
  u.pathname = `/${REHEARSAL_DB}`;
  return u.toString();
})();
if (new URL(realUrl).pathname === `/${REHEARSAL_DB}`) throw new Error("DATABASE_URL already points at the rehearsal database; point it at the real one");

const tsx = process.platform === "win32" ? "npx.cmd" : "npx";
function run(label: string, cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {}) {
  console.log(`\n── ${label}`);
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? process.cwd(), env: { ...process.env, ...opts.env }, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (!opts.quiet) process.stdout.write((r.stdout ?? "").split("\n").filter((l) => !l.startsWith("SNAPSHOT ")).join("\n"));
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? "");
    console.error(`${label} failed (exit ${r.status})`);
    process.exit(1);
  }
  return r.stdout ?? "";
}
const snapshot = (label: string, url: string, asOf: string): Snapshot => {
  const out = run(label, tsx, ["tsx", "scripts/rehearse-recovery.ts", shopId, "--snapshot", asOf], { env: { DATABASE_URL: url }, quiet: true });
  const line = out.split("\n").find((l) => l.startsWith("SNAPSHOT "));
  if (!line) throw new Error(`${label}: no snapshot printed`);
  return JSON.parse(line.slice(9)) as Snapshot;
};

// The last sealed day and the anchor come from the real database, before the "wipe".
const real = postgres(realUrl, { prepare: false, max: 1 });
const [shopRow] = await real`select anchor_object_id from shops where id = ${shopId}`;
const [lastSeal] = await real`select max(date) as d from sealed_days where shop_id = ${shopId}`;
await real.end();
const anchorId = shopRow?.anchor_object_id as string | undefined;
const asOf = lastSeal?.d as string | undefined;
if (!anchorId || !asOf) throw new Error(`${shopId} has not been sealed yet: run scripts/seal-shop.ts first`);
console.log(`Rehearsing recovery for ${shopId}, as of the last sealed day ${asOf}`);

const before = snapshot("1. BEFORE: advice from the real database", realUrl, asOf);

// Fresh rehearsal database: drop and recreate only the database with the fixed rehearsal name.
console.log(`\n── 2. Wipe: fresh empty database "${REHEARSAL_DB}"`);
const admin = postgres(realUrl, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${REHEARSAL_DB} with (force)`);
await admin.unsafe(`create database ${REHEARSAL_DB}`);
await admin.end();
run("   migrate the empty database", "pnpm", ["db:migrate"], { env: { DATABASE_URL: rehearsalUrl }, quiet: true });

const outDir = mkdtempSync(join(tmpdir(), "trustbook-recovered-"));
run("3. Recover from Walrus + Sui anchor (tools/recovery, no database)", tsx, ["tsx", "src/cli.ts", "--shop", shopId, "--anchor", anchorId, "--env", "../../.env", "--out", outDir], { cwd: resolve("../../tools/recovery") });
run("4. Import into the empty database", tsx, ["tsx", "scripts/import-recovery.ts", outDir, "--database-url", rehearsalUrl]);

const after = snapshot("5. AFTER: advice from the recovered database", rehearsalUrl, asOf);

// ── Compare. ───────────────────────────────────────────────────────────────────────────────────
const naira = (k: number | null) => (k === null ? "—" : `₦${(k / 100).toLocaleString("en-NG")}`);
const differences: string[] = [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
if (!same(Object.keys(before.months), Object.keys(after.months))) differences.push("months differ");
for (const m of Object.keys(before.months)) if (!same(before.months[m], after.months[m])) differences.push(`month ${m} totals differ`);
if (before.totalEntries !== after.totalEntries) differences.push(`entries: ${before.totalEntries} before, ${after.totalEntries} after`);
for (const b of before.advice) {
  const a = after.advice.find((x) => x.customerId === b.customerId);
  if (!a) differences.push(`${b.name} missing after recovery`);
  else if (!same(b, a)) differences.push(`${b.name}: advice differs`);
}

const focus = values.customer ?? before.advice.find((a) => a.label === "Careful")?.customerId ?? before.advice[0]?.customerId;
const fb = before.advice.find((a) => a.customerId === focus);
const fa = after.advice.find((a) => a.customerId === focus);
const col = (s: string) => s.padEnd(58).slice(0, 58);
const sideBySide = (rows: [string, string, string][]) => rows.forEach(([k, l, r]) => console.log(`${k.padEnd(14)} ${col(l)} | ${col(r)}${l === r ? "" : "   <-- DIFFERENT"}`));
console.log(`\n${"".padEnd(14)} ${col("BEFORE (real database)")} | ${col("AFTER (wiped, recovered from Walrus)")}`);
if (fb && fa) {
  const mem = (x: typeof fb) => (x.memories === null ? ["memory unreachable"] : x.memories.map((m) => `"${m.summary}" (blob ${m.blobId.slice(0, 8)}…)`));
  const mb = mem(fb);
  const ma = mem(fa);
  sideBySide([
    ["Customer", fb.name, fa.name],
    ["Label", fb.label, fa.label],
    ["Advice", fb.advice, fa.advice],
    ["Evidence", fb.evidence, fa.evidence],
    ["Owes", `${naira(fb.owedKobo)} (${naira(fb.overdueKobo)} overdue)`, `${naira(fa.owedKobo)} (${naira(fa.overdueKobo)} overdue)`],
    ["Limit", naira(fb.suggestedLimitKobo), naira(fa.suggestedLimitKobo)],
    ...Array.from({ length: Math.max(mb.length, ma.length) }, (_, i): [string, string, string] => [i === 0 ? "Remembered" : "", mb[i] ?? "", ma[i] ?? ""]),
  ]);
}
console.log("\nAll customers:");
for (const b of before.advice) {
  const a = after.advice.find((x) => x.customerId === b.customerId);
  console.log(`  ${b.name.padEnd(10)} ${b.label.padEnd(15)} ${naira(b.owedKobo).padEnd(10)} → ${(a?.label ?? "missing").padEnd(15)} ${naira(a?.owedKobo ?? 0).padEnd(10)} ${a && same(a, b) ? "same" : "DIFFERENT"}`);
}
console.log(`\nMonths compared: ${Object.keys(before.months).join(", ")} — ${Object.keys(before.months).every((m) => same(before.months[m], after.months[m])) ? "all totals identical" : "DIFFERENT"}`);
console.log(`Entries compared: ${before.totalEntries}. Entries recorded after ${asOf} (not sealed yet, so not on Walrus): ${before.unsealed}.`);
console.log(`Recovered files: ${outDir}`);
if (differences.length) {
  console.log(`\nRESULT: DIFFERENT\n${differences.map((d) => `  - ${d}`).join("\n")}`);
  process.exit(1);
}
console.log("\nRESULT: IDENTICAL — the advice, the numbers and the cited memories survived the wipe.");
