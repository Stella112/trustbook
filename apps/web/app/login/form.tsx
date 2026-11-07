"use client";

import { useActionState } from "react";
import { Field } from "../onboarding/form";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-5">
      <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" defaultValue={state.email} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" />
      {state.error && <p className="text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Checking…" : "Sign in"}
      </button>
      <p className="text-center">
        <a href="/forgot" className="text-emerald-800 underline">
          Forgot password?
        </a>
      </p>
    </form>
  );
}
