import { Logo } from "../../src/ui/logo";
import { ResetForm } from "./form";

export const metadata = { title: "Choose a new password · Trustbook" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-8">
      <a href="/" className="mb-10 inline-block" aria-label="Trustbook home">
        <Logo />
      </a>
      <h1 className="text-3xl">Choose a new password</h1>
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="mt-4 text-stone-700">
          This page needs the link from your email.{" "}
          <a href="/forgot" className="text-emerald-800 underline">
            Ask for a new one
          </a>
          .
        </p>
      )}
    </main>
  );
}
