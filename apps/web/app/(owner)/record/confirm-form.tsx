"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmDraft, type ConfirmState } from "./actions";

/** Confirm / Change for a reading card; asks for the PIN when the card records money received. */
export function ConfirmForm({ token, editHref, needsPin }: { token: string; editHref: string; needsPin: boolean }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmDraft, {});
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="draft" value={token} />
      {needsPin && (
        <label className="mb-3 block">
          <span className="text-sm font-medium">Your PIN approves this payment</span>
          <input name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" required className="mt-1 block w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
        </label>
      )}
      {state.error && <p className="mb-3 text-red-700">{state.error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Link href={editHref} className="rounded-xl border border-stone-400 px-4 py-4 text-center text-lg font-medium">
          Change
        </Link>
        <button type="submit" disabled={pending} className="rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Confirm"}
        </button>
      </div>
    </form>
  );
}
