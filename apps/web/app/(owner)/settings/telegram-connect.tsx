"use client";

import { useActionState } from "react";
import { connectTelegram, disconnectTelegram, type TelegramState } from "./telegram-actions";

export function TelegramConnect({ linked }: { linked: boolean }) {
  const [state, action, pending] = useActionState<TelegramState>(connectTelegram, {});
  if (linked && !state.code) {
    return (
      <div className="space-y-3">
        <p className="text-stone-700">Your Telegram is connected. Send the bot notes, voice notes or questions, and it records them in this shop after you confirm.</p>
        <form action={disconnectTelegram}>
          <button type="submit" className="btn-ghost text-sm">Disconnect Telegram</button>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-stone-700">Record sales and credit, send voice notes and ask questions from Telegram. You still confirm every entry.</p>
      {state.code && state.username ? (
        <div className="rounded-xl bg-emerald-50 p-4">
          <a href={`https://t.me/${state.username}?start=${state.code}`} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">
            Open Telegram and connect
          </a>
          <p className="mt-3 text-sm text-stone-700">
            Or open <span className="font-semibold">@{state.username}</span> and send: <span className="font-mono font-semibold">/link {state.code}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">This code works once, for 15 minutes.</p>
        </div>
      ) : (
        <form action={action}>
          <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
            {pending ? "Preparing…" : "Connect Telegram"}
          </button>
        </form>
      )}
      {state.error && <p className="text-red-700">{state.error}</p>}
    </div>
  );
}
