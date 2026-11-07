import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "../../src/db/client";
import { currentOwner } from "../../src/lib/owner";
import { startSession } from "../../src/lib/shop";
import { openDemoShop } from "./actions";
import { OnboardingForm } from "./form";

export const dynamic = "force-dynamic";

/** Shop profile setup for a signed-in owner; otherwise the way in (account or demo shop). */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const owner = await currentOwner();
  if (owner) {
    const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.ownerId, owner.id));
    if (shop) {
      await startSession(shop.id);
      redirect("/");
    }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Set up your shop</h1>
      {owner ? (
        <>
          <p className="mt-2 text-stone-700">Signed in as {owner.email}. Tell Trustbook about your shop.</p>
          <div className="mt-6">
            <OnboardingForm />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-stone-700">Trustbook keeps your sales and credit, and learns who pays. First, create your account.</p>
          <a href="/signup" className="mt-6 block rounded-xl bg-emerald-700 px-4 py-4 text-center text-lg font-semibold text-white">
            Create an account
          </a>
          <p className="mt-4 text-center">
            Already have one?{" "}
            <a href="/login" className="font-semibold text-emerald-800 underline">
              Sign in
            </a>
          </p>
        </>
      )}
      <form action={openDemoShop} className="mt-8 border-t border-stone-200 pt-6">
        <p className="text-stone-700">Just looking? Open a sample shop filled with demo data.</p>
        <button type="submit" className="mt-3 w-full rounded-xl border border-stone-400 px-4 py-3 text-lg font-medium">
          Open the demo shop
        </button>
        {demo === "missing" && <p className="mt-2 text-sm text-red-700">The demo shop has not been set up yet.</p>}
      </form>
    </main>
  );
}
