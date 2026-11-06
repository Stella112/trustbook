import { latestCheckpoint, readAnchor } from "@trustbook/chain";
import { formatNaira, formatUsdc } from "@trustbook/ledger";
import { relayerHealth } from "@trustbook/memory";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../src/db/client";
import { DEMO_SHOP_ID } from "../../src/seed/demo";

export const dynamic = "force-dynamic";

const settle = async <T,>(p: Promise<T>) => {
  try {
    return { ok: true as const, value: await p };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message.slice(0, 160) : String(err) };
  }
};

/**
 * Public evidence for judges (brief §5 item 12). Every value comes from a live call or the outbox
 * record of a confirmed write; nothing is hardcoded.
 */
export default async function ProofPage() {
  // The demo shop's own anchor, created when it was first sealed (the Phase 0 test anchor holds a dummy hash).
  const [demo] = await db.select({ anchorId: schema.shops.anchorObjectId }).from(schema.shops).where(eq(schema.shops.id, DEMO_SHOP_ID));
  const anchorId = demo?.anchorId ?? undefined;
  const seals = await db
    .select({ kind: schema.seals.kind, fromDate: schema.seals.fromDate, toDate: schema.seals.toDate, dayCount: schema.seals.dayCount, blobId: schema.seals.blobId, sealedAt: schema.seals.sealedAt, anchorTx: schema.seals.anchorTx })
    .from(schema.seals)
    .where(eq(schema.seals.shopId, DEMO_SHOP_ID))
    .orderBy(desc(schema.seals.sealedAt), desc(schema.seals.toDate));
  const [walrus, checkpoint, anchor, counts, recent] = await Promise.all([
    settle(relayerHealth()),
    settle(latestCheckpoint()),
    anchorId ? settle(readAnchor(anchorId)) : Promise.resolve(null),
    db
      .select({ status: schema.outbox.status, demo: schema.outbox.demo, n: sql<number>`count(*)::int` })
      .from(schema.outbox)
      .groupBy(schema.outbox.status, schema.outbox.demo),
    db
      .select({
        kind: schema.outbox.kind,
        namespace: schema.outbox.namespace,
        blobId: schema.outbox.blobId,
        confirmedAt: schema.outbox.confirmedAt,
        demo: schema.outbox.demo,
        content: schema.outbox.content,
      })
      .from(schema.outbox)
      .where(eq(schema.outbox.status, "confirmed"))
      .orderBy(desc(schema.outbox.confirmedAt))
      .limit(50),
  ]);
  const payments = await db
    .select({ digest: schema.payQuotes.digest, amountKobo: schema.payQuotes.amountKobo, usdcMicro: schema.payQuotes.usdcMicro, paidAt: schema.payQuotes.paidAt })
    .from(schema.payQuotes)
    .where(eq(schema.payQuotes.status, "paid"))
    .orderBy(desc(schema.payQuotes.paidAt))
    .limit(20);
  const count = (status: string, demo?: boolean) => counts.filter((c) => c.status === status && (demo === undefined || c.demo === demo)).reduce((s, c) => s + c.n, 0);
  const confirmed = count("confirmed");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Proof</h1>
      <p className="mt-1 text-stone-700">Live evidence that Trustbook writes to Walrus Memory on mainnet and reads Sui through Tatum.</p>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card title="Walrus Memory relayer" ok={walrus.ok && walrus.value.ok} detail={walrus.ok ? (walrus.value.ok ? "Reachable" : walrus.value.detail) : walrus.error} />
        <Card
          title="Tatum (Sui mainnet GraphQL)"
          ok={checkpoint.ok}
          detail={checkpoint.ok ? `Latest checkpoint ${Number(checkpoint.value.sequenceNumber).toLocaleString("en-NG")} · ${new Date(checkpoint.value.timestamp).toUTCString()}` : checkpoint.error}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Confirmed memories: {confirmed}</h2>
        <p className="text-sm text-stone-600">
          A memory counts only after Walrus confirms the write and returns a blob ID. {count("confirmed", true)} are demo data, {count("confirmed", false)} are live.
          Waiting: {count("pending") + count("submitted")} · failed: {count("failed")}.
        </p>
        <ul className="mt-3 divide-y divide-stone-200 rounded-xl bg-white shadow-sm">
          {recent.map((r) => {
            const summary = (() => {
              try {
                return (JSON.parse(r.content) as { summary?: string }).summary ?? "";
              } catch {
                return "";
              }
            })();
            return (
              <li key={r.blobId} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.kind}</span>
                  {r.demo && <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">Demo data</span>}
                  <span className="text-stone-500">{r.namespace}</span>
                </div>
                <div className="mt-1">{summary}</div>
                <div className="mt-1 break-all font-mono text-xs text-stone-600">
                  blob {r.blobId} · confirmed {r.confirmedAt?.toISOString()}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Sui head anchor</h2>
        {!anchorId ? (
          <p className="text-stone-600">No anchor configured.</p>
        ) : anchor && anchor.ok && anchor.value ? (
          <p className="break-all text-sm">
            Object {anchorId} · last day {anchor.value.lastDay || "—"} · {anchor.value.dayCount} days · last update tx {anchor.value.lastTxDigest} (read through Tatum)
          </p>
        ) : (
          <p className="text-red-700">Could not read the anchor: {anchor && !anchor.ok ? anchor.error : "not found"}</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Books sealed to Walrus (Recovery Mode)</h2>
        <p className="text-sm text-stone-600">
          Each blob holds a week of day records, chained by hash; month checkpoints hold the totals recovery must match. Demo history was sealed on the date shown, not on its
          business dates. <a className="underline" href="/verify">Verify these books yourself</a>.
        </p>
        {seals.length === 0 ? (
          <p className="mt-2 text-stone-600">Nothing sealed yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl bg-white text-sm shadow-sm">
            {seals.map((s) => (
              <li key={s.blobId} className="px-4 py-3">
                <div className="font-semibold">
                  {s.kind === "month" ? `Month checkpoint ${s.fromDate.slice(0, 7)}` : `Days ${s.fromDate} to ${s.toDate}`} · {s.dayCount} days in the chain
                </div>
                <div className="break-all font-mono text-xs text-stone-600">
                  blob {s.blobId} · sealed {s.sealedAt.toISOString()}
                </div>
                {s.anchorTx && (
                  <a href={`https://suiscan.xyz/mainnet/tx/${s.anchorTx}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs underline">
                    anchor update {s.anchorTx}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Payments verified on Sui</h2>
        {payments.length === 0 ? (
          <p className="text-stone-600">No Sui payments yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl bg-white shadow-sm">
            {payments.map((p) => (
              <li key={p.digest} className="px-4 py-3 text-sm">
                <div className="font-semibold">
                  {formatNaira(p.amountKobo)} · {formatUsdc(p.usdcMicro)} USDC · verified through Tatum
                </div>
                <a href={`https://suiscan.xyz/mainnet/tx/${p.digest}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs underline">
                  {p.digest}
                </a>
                <div className="text-xs text-stone-500">{p.paidAt?.toISOString()}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Card({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 font-semibold">
        <span className={`inline-block h-3 w-3 rounded-full ${ok ? "bg-emerald-600" : "bg-red-600"}`} />
        {title}
      </div>
      <p className="mt-1 break-words text-sm text-stone-700">{detail}</p>
    </div>
  );
}
