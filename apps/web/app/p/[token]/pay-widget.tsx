"use client";

import dynamic from "next/dynamic";

// The wallet library uses browser-only web components, so it loads on the client only.
export const PayWidget = dynamic(() => import("./pay-flow").then((m) => m.PayFlow), {
  ssr: false,
  loading: () => <p className="mt-6 text-stone-600">Loading wallet options…</p>,
});
