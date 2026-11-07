import { inArray } from "drizzle-orm";
import { db, schema } from "../../src/db/client";
import { publicShopIds } from "../../src/lib/public-shops";
import { DEMO_SHOP_ID } from "../../src/seed/demo";
import { Verifier } from "./verifier";

export const metadata = { title: "Verify the books · Trustbook" };
export const dynamic = "force-dynamic";

/**
 * Public, read-only (brief §6.8a): anyone runs the recovery proof in their own browser. No keys reach
 * the browser; the records come from Walrus through a read-only route. Live shops appear only when
 * their owner made them public, and their customers show as initials.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const { shop: wanted } = await searchParams;
  const ids = publicShopIds();
  const rows = await db.select({ id: schema.shops.id, name: schema.shops.name, mode: schema.shops.mode, anchor: schema.shops.anchorObjectId }).from(schema.shops).where(inArray(schema.shops.id, ids));
  // Live shops first: they are the real thing; the demo shop is the sample.
  const shops = rows.sort((a, b) => (a.mode === b.mode ? a.name.localeCompare(b.name) : a.mode === "LIVE" ? -1 : 1));
  const selected = shops.find((s) => s.id === wanted) ?? shops.find((s) => s.mode === "LIVE" && s.anchor) ?? shops.find((s) => s.id === DEMO_SHOP_ID);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {shops.length > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Choose a shop">
          {shops.map((s) => (
            <a
              key={s.id}
              href={`/verify?shop=${encodeURIComponent(s.id)}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s.id === selected?.id ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-stone-300 text-stone-700"}`}
            >
              {s.name} · {s.mode === "LIVE" ? "Live shop" : "Demo"}
            </a>
          ))}
        </nav>
      )}
      {selected?.mode === "DEMO" ? (
        <div className="inline-block rounded bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900">Demo data</div>
      ) : (
        <div className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-900">Live shop · real records · customers shown as initials</div>
      )}
      <h1 className="mt-2 text-3xl">Verify the books{selected ? `: ${selected.name}` : ""}</h1>
      <p className="mt-2 text-stone-700">
        Trustbook seals each day&apos;s records to Walrus and publishes the newest day&apos;s fingerprint on Sui. This page reads those records back and proves, in your
        browser, that nothing was changed, nothing is missing, and the totals add up.
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm text-stone-700">
        <li>Fingerprints: every day record matches its SHA-256 hash.</li>
        <li>Chain: each day points to the day before, all the way back to the first.</li>
        <li>Complete: the newest day matches the anchor on Sui, read through Tatum, so dropped days show up.</li>
        <li>Totals and balances: rebuilt from the raw entries and compared to the sealed month checkpoints.</li>
      </ul>
      {!selected ? (
        <p className="mt-6 text-stone-700">No public shop is available.</p>
      ) : !selected.anchor ? (
        <p className="mt-6 rounded-xl bg-white p-4 text-stone-700 border border-stone-200">This shop&apos;s first day has not been sealed yet. Days are sealed each night, so check back tomorrow.</p>
      ) : (
        <Verifier key={selected.id} shopId={selected.id} />
      )}
    </main>
  );
}
