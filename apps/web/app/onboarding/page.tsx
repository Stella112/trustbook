import { openDemoShop } from "./actions";
import { OnboardingForm } from "./form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Set up your shop</h1>
      <p className="mt-2 text-stone-700">Trustbook keeps your sales and credit, and learns who pays.</p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
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
