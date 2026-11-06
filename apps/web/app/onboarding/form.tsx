"use client";

import { useActionState } from "react";
import { createShop, type OnboardingState } from "./actions";

const initial: OnboardingState = { errors: {} };

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createShop, initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5">
      <Field name="shopName" label="Shop name" placeholder="Mama Ngozi Provisions" defaultValue={v.shopName} error={state.errors.shopName} />
      <Field name="ownerName" label="Your name" placeholder="Ngozi" defaultValue={v.ownerName} error={state.errors.ownerName} />
      <label className="block">
        <span className="text-base font-medium">Money</span>
        <select name="currency" defaultValue="NGN" className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg">
          <option value="NGN">Naira (₦)</option>
        </select>
      </label>
      <Field
        name="openingCash"
        label="Cash in the shop today (₦)"
        placeholder="150,000"
        inputMode="decimal"
        defaultValue={v.openingCash}
        error={state.errors.openingCash}
        hint="The money you have now, before recording anything."
      />
      <Field
        name="suiAddress"
        label="Sui address for payments (optional)"
        placeholder="0x…"
        defaultValue={v.suiAddress}
        error={state.errors.suiAddress}
        hint="Where customers' Sui payments go. You can add it later."
      />
      <Field name="pin" label="Choose a 6-number PIN" type="password" inputMode="numeric" error={state.errors.pin} hint="You will use it to open your book on another phone." />
      <Field name="pinConfirm" label="Type the PIN again" type="password" inputMode="numeric" error={state.errors.pinConfirm} />
      {state.errors.form && <p className="text-red-700">{state.errors.form}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Setting up…" : "Start my book"}
      </button>
    </form>
  );
}

export function Field(props: { name: string; label: string; placeholder?: string; defaultValue?: string; error?: string; hint?: string; inputMode?: "decimal" | "numeric"; type?: "text" | "password" }) {
  return (
    <label className="block">
      <span className="text-base font-medium">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        maxLength={props.type === "password" ? 6 : undefined}
        autoComplete={props.type === "password" ? "off" : undefined}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        inputMode={props.inputMode}
        aria-invalid={!!props.error}
        className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg aria-[invalid=true]:border-red-600"
      />
      {props.hint && !props.error && <span className="mt-1 block text-sm text-stone-600">{props.hint}</span>}
      {props.error && <span className="mt-1 block text-sm text-red-700">{props.error}</span>}
    </label>
  );
}
