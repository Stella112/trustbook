import { latestCheckpoint, readAnchor } from "@trustbook/chain";
import { formatNaira, formatUsdc } from "@trustbook/ledger";
import { relayerHealth } from "@trustbook/memory";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../src/db/client";
import { initials, publicShopIds } from "../../src/lib/public-shops";

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
 * record of a confirmed write; nothing is hardcoded. Only public shops are shown (lib/public-shops),
 * and a live shop's customers appear as initials.
 */
export default async function ProofPage() {
  const ids = publicShopIds();
  const shops = await db
    .select({ id: schema.shops.id, name: schema.shops.name, mode: schema.shops.mode, anchorId: schema.shops.anchorObjectId })
    .from(schema.shops)
    .where(inArray(schema.shops.id, ids));
  // Live shops first: they are the real thing; the demo shop is the sample.
  shops.sort((x, y) => (x.mode === y.mode ? x.name.localeCompare(y.name) : x.mode === "LIVE" ? -1 : 1));
  const liveIds = shops.filter((x) => x.mode === "LIVE").map((x) => x.id);
  const liveCustomers = liveIds.length
    ? await db.select({ shopId: schema.customers.shopId, name: schema.customers.name }).from(schema.customers).where(inArray(schema.customers.shopId, liveIds))
    : [];
  const seals = await db
    .select({ shopId: schema.seals.shopId, kind: schema.seals.kind, fromDate: schema.seals.fromDate, toDate: schema.seals.toDate, dayCount: schema.seals.dayCount, blobId: schema.seals.blobId, sealedAt: schema.seals.sealedAt, anchorTx: schema.seals.anchorTx })
    .from(schema.seals)
    .where(inArray(schema.seals.shopId, ids))
    .orderBy(desc(schema.seals.sealedAt), desc(schema.seals.toDate));
  const [walrus, checkpoint, anchors, counts, recent] = await Promise.all([
    settle(relayerHealth()),
    settle(latestCheckpoint()),
    Promise.all(shops.map((x) => (x.anchorId ? settle(readAnchor(x.anchorId)) : Promise.resolve(null)))),
    db
      .select({ status: schema.outbox.status, demo: schema.outbox.demo, n: sql<number>`count(*)::int` })
      .from(schema.outbox)
      .where(inArray(schema.outbox.shopId, ids))
      .groupBy(schema.outbox.status, schema.outbox.demo),
    db
      .select({
        shopId: schema.outbox.shopId,
        kind: schema.outbox.kind,
        namespace: schema.outbox.namespace,
        blobId: schema.outbox.blobId,
        confirmedAt: schema.outbox.confirmedAt,
        demo: schema.outbox.demo,
        content: schema.outbox.content,
      })
      .from(schema.outbox)
      .where(and(eq(schema.outbox.status, "confirmed"), inArray(schema.outbox.shopId, ids)))
      .orderBy(desc(schema.outbox.confirmedAt))
      .limit(50),
  ]);
  const payments = await db
    .select({ digest: schema.payQuotes.digest, amountKobo: schema.payQuotes.amountKobo, usdcMicro: schema.payQuotes.usdcMicro, paidAt: schema.payQuotes.paidAt })
    .from(schema.payQuotes)
    .where(and(eq(schema.payQuotes.status, "paid"), inArray(schema.payQuotes.shopId, ids)))
    .orderBy(desc(schema.payQuotes.paidAt))
    .limit(20);
  const count = (status: string, demo?: boolean) => counts.filter((c) => c.status === status && (demo === undefined || c.demo === demo)).reduce((t, c) => t + c.n, 0);
  const confirmed = count("confirmed");

  /** A memory's one-line summary, with a live shop's customer names turned into initials. */
  const shown = (shopId: string, content: string) => {
    let summary = "";
    try {
      summary = (JSON.parse(content) as { summary?: string }).summary ?? "";
    } catch {
      return "";
    }
    if (!liveIds.includes(shopId)) return summary;
    // Longest names first, so "Mama Ngozi" is replaced before "Mama".
    const names = liveCustomers.filter((c) => c.shopId === shopId).map((c) => c.name).sort((x, y) => y.length - x.length);
    for (const n of names) summary = summary.split(n).join(initials(n));
    return summary;
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl">Proof</h1>
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
          A memory counts only after Walrus confirms the write and returns a blob ID. {count("confirmed", false)} are from live shops, {count("confirmed", true)} are demo data.
          Waiting: {count("pending") + count("submitted")} · failed: {count("failed")}.
        </p>
        {count("held") + count("summarized") > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A month reached 90 memories, so single events are now saved as weekly summaries per customer, keeping each month under Walrus Memory&apos;s 100-record
            restore limit. Held for this week&apos;s summary: {count("held")} · already summarised: {count("summarized")}.
          </p>
        )}
        <ul className="mt-3 divide-y divide-stone-200 rounded-xl bg-white border border-stone-200">
          {recent.map((r) => (
            <li key={r.blobId} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.kind}</span>
                {r.demo ? (
                  <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">Demo data</span>
                ) : (
                  <span className="rounded bg-emerald-100 px-1.5 text-xs font-semibold text-emerald-900">Live</span>
                )}
                <span className="text-stone-500">{r.namespace}</span>
              </div>
              <div className="mt-1">{shown(r.shopId, r.content)}</div>
              <div className="mt-1 break-all font-mono text-xs text-stone-600">
                blob {r.blobId} · confirmed {r.confirmedAt?.toISOString()}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {shops.map((shop, i) => {
        const anchor = anchors[i];
        const shopSeals = seals.filter((x) => x.shopId === shop.id);
        return (
          <section key={shop.id} className="mt-6">
            <h2 className="text-xl font-semibold">
              {shop.name}{" "}
              <span className={`ml-1 rounded px-1.5 align-middle text-xs font-semibold ${shop.mode === "LIVE" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                {shop.mode === "LIVE" ? "Live shop" : "Demo data"}
              </span>
            </h2>
            <h3 className="mt-2 font-semibold">Sui head anchor</h3>
            {!shop.anchorId ? (
              <p className="text-stone-600">Not created yet: it is created when the shop&apos;s first day is sealed, each night.</p>
            ) : anchor && anchor.ok && anchor.value ? (
              <p className="break-all text-sm">
                Object {shop.anchorId} · last day {anchor.value.lastDay || "—"} · {anchor.value.dayCount} days · last update tx {anchor.value.lastTxDigest} (read through Tatum)
              </p>
            ) : (
              <p className="text-red-700">Could not read the anchor: {anchor && !anchor.ok ? anchor.error : "not found"}</p>
            )}
            <h3 className="mt-3 font-semibold">Books sealed to Walrus</h3>
            <p className="text-sm text-stone-600">
              Each blob holds up to a week of day records, chained by hash; month checkpoints hold the totals recovery must match.
              {shop.mode === "DEMO" ? " Demo history was sealed on the date shown, not on its business dates." : ""}{" "}
              <a className="underline" href={`/verify?shop=${encodeURIComponent(shop.id)}`}>
                Verify these books yourself
              </a>
              .
            </p>
            {shopSeals.length === 0 ? (
              <p className="mt-2 text-stone-600">Nothing sealed yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-stone-200 rounded-xl bg-white text-sm border border-stone-200">
                {shopSeals.map((x) => (
                  <li key={x.blobId} className="px-4 py-3">
                    <div className="font-semibold">
                      {x.kind === "month" ? `Month checkpoint ${x.fromDate.slice(0, 7)}` : `Days ${x.fromDate} to ${x.toDate}`} · {x.dayCount} days in the chain
                    </div>
                    <div className="break-all font-mono text-xs text-stone-600">
                      blob {x.blobId} · sealed {x.sealedAt.toISOString()}
                    </div>
                    {x.anchorTx && (
                      <a href={`https://suiscan.xyz/mainnet/tx/${x.anchorTx}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs underline">
                        anchor update {x.anchorTx}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Payments verified on Sui</h2>
        {payments.length === 0 ? (
          <p className="text-stone-600">No Sui payments yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl bg-white border border-stone-200">
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
    <div className="rounded-xl bg-white p-4 border border-stone-200">
      <div className="flex items-center gap-2 font-semibold">
        <span className={`inline-block h-3 w-3 rounded-full ${ok ? "bg-emerald-600" : "bg-red-600"}`} />
        {title}
      </div>
      <p className="mt-1 break-words text-sm text-stone-700">{detail}</p>
    </div>
  );
}
