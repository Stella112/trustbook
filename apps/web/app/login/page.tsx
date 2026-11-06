"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Field } from "../onboarding/form";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Open your book</h1>
      <p className="mt-2 text-stone-700">Enter your shop code and your 6-number PIN.</p>
      <form action={action} className="mt-6 space-y-5">
        <Field name="code" label="Shop code" placeholder="AB12CD34" defaultValue={state.code} />
        <Field name="pin" label="PIN" type="password" inputMode="numeric" />
        {state.error && <p className="text-red-700">{state.error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
          {pending ? "Checking…" : "Open my book"}
        </button>
      </form>
      <p className="mt-6 text-center">
        New here?{" "}
        <a href="/onboarding" className="font-semibold text-emerald-800 underline">
          Set up your shop
        </a>
      </p>
    </main>
  );
}
