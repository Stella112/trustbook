import { formatNaira, formatUsdc } from "@trustbook/ledger";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../../src/db/client";

export const dynamic = "force-dynamic";

/** Receipt for a verified Sui payment. Shows only what the server verified through Tatum. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [q] = await db.select().from(schema.payQuotes).where(eq(schema.payQuotes.id, id));
  const [shop] = q ? await db.select({ name: schema.shops.name }).from(schema.shops).where(eq(schema.shops.id, q.shopId)) : [];
  if (!q || q.status !== "paid" || !q.digest || !shop) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl">Receipt not found</h1>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">{shop.name}</p>
      <h1 className="mt-1 text-3xl">Receipt</h1>
      <div className="mt-4 rounded-xl bg-white p-4 border border-stone-200">
        <div className="flex justify-between py-1">
          <span className="text-stone-600">Amount</span>
          <span className="font-semibold">{formatNaira(q.amountKobo)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-stone-600">Paid</span>
          <span className="font-semibold">{formatUsdc(q.usdcMicro)} USDC</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-stone-600">Rate</span>
          <span>₦{q.rate} per USDC</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-stone-600">Date</span>
          <span>{q.paidAt?.toUTCString()}</span>
        </div>
        <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">Verified on Sui</p>
        <p className="mt-2 break-all font-mono text-xs text-stone-600">Transaction {q.digest}</p>
        <a href={`https://suiscan.xyz/mainnet/tx/${q.digest}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline">
          View on Suiscan
        </a>
      </div>
    </main>
  );
}
