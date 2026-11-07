"use client";

import { useState } from "react";

const TABS = [
  {
    key: "before",
    label: "Before you give credit",
    title: "Know who pays, before the goods leave your shop.",
    body: "When a customer asks for credit, Trustbook shows how they really pay: on time or late, promises kept or broken. The evidence comes from what it remembers on Walrus; the numbers come from your book.",
    card: (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl">Advice for Tunde</span>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Careful</span>
        </div>
        <p className="text-stone-700">Paid 0 of 6 on time · usually 5 days late · 4 promises broken</p>
        <p className="text-stone-700">Suggested limit ₦5,400</p>
        <div className="rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Remembered on Walrus</div>
          “Tunde broke the promise to pay by 17 Oct.”
        </div>
      </div>
    ),
  },
  {
    key: "during",
    label: "When you sell",
    title: "Say it the way you say it.",
    body: "Type or speak in Pidgin or English. Trustbook writes it down, shows you a card to check, and saves nothing until you confirm. Every naira is counted by plain code, never guessed.",
    card: (
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-3 text-stone-700">“Tunde collect 2 crates egg, 9k, he go pay Friday”</div>
        <div className="rounded-xl border-2 border-emerald-700 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Sale</div>
          <p className="mt-1">2 × Eggs (crate) · ₦9,000</p>
          <p className="text-stone-600">On credit to Tunde · to pay by Friday</p>
        </div>
        <div className="flex gap-2">
          <span className="btn-ghost px-4 py-2 text-sm">Change</span>
          <span className="btn-primary px-5 py-2 text-sm">Confirm</span>
        </div>
      </div>
    ),
  },
  {
    key: "after",
    label: "When the day ends",
    title: "Your day is sealed and safe.",
    body: "Every night, the day's records are sealed to Walrus and their fingerprint is written to Sui. Send WhatsApp reminders with a pay link; customers pay with USDC or any Sui token, and Tatum checks every payment.",
    card: (
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-white p-3">
          <div className="font-semibold">Books secured on Walrus</div>
          <div className="text-stone-600">42 days, chained by fingerprint · anchored on Sui</div>
        </div>
        <div className="rounded-xl bg-white p-3">
          <div className="font-semibold">Reminder sent on WhatsApp</div>
          <div className="text-stone-600">“You can pay with Sui (USDC or other tokens) here…”</div>
        </div>
        <div className="rounded-xl bg-white p-3">
          <div className="font-semibold">Paid · Verified on Sui</div>
          <div className="text-stone-600">₦100 · 0.074347 USDC · checked through Tatum</div>
        </div>
      </div>
    ),
  },
];

/** Before / during / after a sale, as tabs. */
export function MomentTabs() {
  const [active, setActive] = useState(0);
  const tab = TABS[active]!;
  return (
    <div className="grid gap-10 md:grid-cols-[220px_1fr] md:gap-16">
      <div role="tablist" aria-label="When Trustbook helps" className="flex gap-2 overflow-x-auto md:flex-col md:gap-0">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`shrink-0 border-b-2 py-3 text-left text-[15px] transition-colors md:pr-4 ${i === active ? "border-stone-900 text-stone-900" : "border-stone-200 text-stone-500 hover:text-stone-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="grid items-start gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-3xl leading-tight md:text-4xl">{tab.title}</h3>
          <p className="mt-4 text-lg leading-relaxed text-stone-600">{tab.body}</p>
        </div>
        <div className="window p-5">
          <WindowDots />
          <div className="mt-4">{tab.card}</div>
        </div>
      </div>
    </div>
  );
}

export function WindowDots() {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}
