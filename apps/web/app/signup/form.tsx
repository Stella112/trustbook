"use client";

import { useActionState } from "react";
import { Field } from "../onboarding/form";
import { signUp, type SignUpState } from "./actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp, { errors: {} });
  return (
    <form action={action} className="space-y-5">
      <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" defaultValue={state.email} error={state.errors.email} />
      <Field name="password" label="Password" type="password" autoComplete="new-password" error={state.errors.password} hint="At least 8 characters." />
      <Field name="passwordConfirm" label="Type the password again" type="password" autoComplete="new-password" error={state.errors.passwordConfirm} />
      {state.errors.form && <p className="text-red-700">{state.errors.form}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
