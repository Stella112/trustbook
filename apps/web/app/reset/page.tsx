import { ResetForm } from "./form";

export const metadata = { title: "Choose a new password · Trustbook" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Choose a new password</h1>
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
