"use client";

import { useActionState } from "react";
import { Field } from "../onboarding/form";
import { choosePassword, type ResetState } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(choosePassword, { errors: {} });
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="token" value={token} />
      <Field name="password" label="New password" type="password" autoComplete="new-password" error={state.errors.password} hint="At least 8 characters." />
      <Field name="passwordConfirm" label="Type it again" type="password" autoComplete="new-password" error={state.errors.passwordConfirm} />
      {state.errors.form && (
        <p className="text-red-700">
          {state.errors.form}{" "}
          <a href="/forgot" className="underline">
            Get a new link
          </a>
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
