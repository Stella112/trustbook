import { Logo } from "../../src/ui/logo";
import { openDemoShop } from "../onboarding/actions";
import { GoogleButton } from "../../src/ui/google-button";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in · Trustbook" };

const MESSAGES: Record<string, string> = {
  google: "Google sign-in did not finish. Please try again.",
  "google-email": "Your Google account has no verified email, so it cannot be used here.",
  reset: "Your password is changed. You are signed in.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-8">
      <a href="/" className="mb-10 inline-block" aria-label="Trustbook home">
        <Logo />
      </a>
      <h1 className="text-3xl">Open your book</h1>
      <p className="mt-2 text-stone-700">Sign in to your Trustbook account.</p>
      {m && MESSAGES[m] && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{MESSAGES[m]}</p>}
      <GoogleButton />
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-6 text-center">
        New here?{" "}
        <a href="/signup" className="font-semibold text-emerald-800 underline">
          Create an account
        </a>
      </p>
      <form action={openDemoShop} className="mt-8 border-t border-stone-200 pt-6">
        <p className="text-stone-700">Just looking? Open a sample shop filled with demo data.</p>
        <button type="submit" className="mt-3 w-full rounded-xl border border-stone-400 px-4 py-3 text-lg font-medium">
          Open the demo shop
        </button>
      </form>
    </main>
  );
}
