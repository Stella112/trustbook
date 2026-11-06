import { formatNaira } from "@trustbook/ledger";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../../src/db/client";
import { readPayLink } from "../../../src/lib/paylink";
import { PayWidget } from "./pay-widget";

export const dynamic = "force-dynamic";

/** Customer pay page (brief §6.5), reached by a signed, expiring link. No sign-in needed. */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = readPayLink(token);
  const shop = link ? (await db.select().from(schema.shops).where(eq(schema.shops.id, link.shopId)))[0] : undefined;
  const customer = link && shop ? (await db.select().from(schema.customers).where(and(eq(schema.customers.id, link.customerId), eq(schema.customers.shopId, shop.id))))[0] : undefined;

  if (!link || !shop || !customer) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">This pay link has expired</h1>
        <p className="mt-2 text-stone-700">Please ask the shop to send you a new one.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      {shop.mode === "DEMO" && <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">Demo shop — payments are real USDC on Sui mainnet</p>}
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">{shop.name}</p>
      <h1 className="mt-1 text-3xl font-bold">Pay {formatNaira(link.amountKobo)}</h1>
      <p className="mt-1 text-stone-700">For {customer.name}&apos;s account. Pay with USDC from any Sui wallet, or with SUI and other tokens, swapped to USDC as you pay. No gas fee: the shop pays it.</p>
      {shop.suiAddress ? <PayWidget token={token} /> : <p className="mt-6 text-stone-700">This shop has not set up Sui payments yet.</p>}
    </main>
  );
}
