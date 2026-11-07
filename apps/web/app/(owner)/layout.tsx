import Link from "next/link";
import type { ReactNode } from "react";
import { loadBook } from "../../src/lib/book";
import { AddressPrompt } from "./address-prompt";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const { shop } = await loadBook();
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      {shop.mode === "DEMO" && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">Demo data — a sample shop, not a real business</p>
      )}
      <header className="flex items-center justify-between gap-3 px-4 pt-5">
        <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
          {shop.name}
        </Link>
        <Link href="/settings" className="flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-stone-700 underline-offset-2 hover:underline">
          Settings
        </Link>
      </header>
      {shop.mode === "LIVE" && !shop.suiAddress && <AddressPrompt />}
      <main className="px-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <NavLink href="/" label="Today" />
          <NavLink href="/month" label="Month" />
          <NavLink href="/customers" label="Customers" />
          <NavLink href="/ask" label="Ask" />
        </div>
      </nav>
    </div>
  );
}
