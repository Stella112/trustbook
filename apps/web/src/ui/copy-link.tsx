"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this pay link:", url);
        }
      }}
      className="block w-full rounded-xl border border-stone-400 px-4 py-3 text-center font-semibold"
    >
      {copied ? "Pay link copied" : "Copy pay link"}
    </button>
  );
}
