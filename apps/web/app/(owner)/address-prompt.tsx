"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Reminds a live shop with no receiving address to add one; hidden on Settings, where the form is. */
export function AddressPrompt() {
  if (usePathname().startsWith("/settings")) return null;
  return (
    <Link href="/settings" className="mx-4 mt-3 block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Add your Sui address so customers can pay you on Sui →
    </Link>
  );
}
