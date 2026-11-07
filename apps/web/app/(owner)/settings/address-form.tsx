"use client";

import dynamic from "next/dynamic";
import { useActionState, useCallback, useState } from "react";
import { updateSuiAddress, type AddressState } from "./actions";

// The wallet library uses browser-only web components, so it loads on the client only.
const WalletFill = dynamic(() => import("./wallet-fill").then((m) => m.WalletFill), {
  ssr: false,
  loading: () => <p className="text-sm text-stone-600">Loading wallet options…</p>,
});

export function AddressForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<AddressState, FormData>(updateSuiAddress, {});
  const [address, setAddress] = useState(current ?? "");
  const fill = useCallback((a: string) => setAddress(a), []);
  return (
    <form action={action} className="space-y-4">
      <WalletFill onAddress={fill} />
      <label className="block">
        <span className="text-base font-medium">Sui address for payments</span>
        <input
          name="suiAddress"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          spellCheck={false}
          autoComplete="off"
          placeholder="0x…"
          className="mt-1 block w-full break-all rounded-xl border border-stone-300 bg-white px-4 py-3 font-mono text-sm"
        />
        <span className="mt-1 block text-sm text-stone-600">Customers&apos; payments go straight to this address. Connect your wallet, or paste the address from it.</span>
      </label>
      <label className="block">
        <span className="text-base font-medium">Your PIN</span>
        <input name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" required className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg" />
        <span className="mt-1 block text-sm text-stone-600">Changing where money goes needs your PIN.</span>
      </label>
      {state.error && <p className="text-red-700">{state.error}</p>}
      {state.saved && (
        <p role="status" className="rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">
          Saved. New payments go to this address.
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save address"}
      </button>
    </form>
  );
}
