import Link from "next/link";
import type { ReactNode } from "react";
import { loadBook } from "../../src/lib/book";
import { Logo } from "../../src/ui/logo";
import { AddressPrompt } from "./address-prompt";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const { shop } = await loadBook();
  return (
    <div className="mx-auto min-h-screen max-w-md pb-28">
      {shop.mode === "DEMO" && (
        <p className="bg-lime px-4 py-2 text-center text-sm font-medium text-emerald-900">Demo data · a sample shop, not a real business</p>
      )}
      <header className="sticky top-0 z-10 bg-white/85 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Today">
            <Logo />
          </Link>
          <Link href="/settings" className="btn-ghost min-h-10 px-4 py-1.5 text-sm">
            Settings
          </Link>
        </div>
        <p className="mt-1 truncate text-sm text-stone-500">{shop.name}</p>
      </header>
      {shop.mode === "LIVE" && !shop.suiAddress && <AddressPrompt />}
      <main className="px-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-3 z-10 px-3">
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-full border border-stone-200 bg-white/95 p-1 shadow-[0_10px_30px_-12px_rgb(14_15_12/0.35)] backdrop-blur">
          <NavLink href="/" label="Today" />
          <NavLink href="/month" label="Month" />
          <NavLink href="/customers" label="Customers" />
          <NavLink href="/ask" label="Ask" />
        </div>
      </nav>
    </div>
  );
}
