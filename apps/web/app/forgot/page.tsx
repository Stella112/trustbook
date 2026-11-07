"use client";

import { useActionState } from "react";
import { Field } from "../onboarding/form";
import { forgotPassword, type ForgotState } from "./actions";

export default function ForgotPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPassword, {});
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-bold">Forgot your password?</h1>
      {state.sent ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-3 text-emerald-900">
          If that email has a Trustbook account, a reset link is on its way. It works once, for one hour. Check your spam folder too.
        </p>
      ) : (
        <>
          <p className="mt-2 text-stone-700">Enter your email and we will send you a link to choose a new password.</p>
          <form action={action} className="mt-6 space-y-5">
            <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" />
            {state.error && <p className="text-red-700">{state.error}</p>}
            <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-center">
        <a href="/login" className="text-emerald-800 underline">
          Back to sign in
        </a>
      </p>
    </main>
  );
}
