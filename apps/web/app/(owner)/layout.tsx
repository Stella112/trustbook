import Link from "next/link";
import type { ReactNode } from "react";
import { loadBook } from "../../src/lib/book";
import { Logo } from "../../src/ui/logo";
import { AddressPrompt } from "./address-prompt";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/month", label: "Month" },
  { href: "/customers", label: "Customers" },
  { href: "/ask", label: "Ask" },
];

/**
 * The app frame. Phones: one column with a floating tab bar at the bottom. Computers: a wider page
 * with the tabs in the header, like the landing page's pill navigation.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const { shop } = await loadBook();
  return (
    <div className="min-h-screen pb-28 md:pb-16">
      {shop.mode === "DEMO" && (
        <p className="bg-lime px-4 py-2 text-center text-sm font-medium text-emerald-900">Demo data · a sample shop, not a real business</p>
      )}
      <header className="sticky top-0 z-10 bg-white/85 px-4 pb-3 pt-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4 md:max-w-5xl">
          <Link href="/today" aria-label="Today" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden flex-1 justify-center md:flex">
            <div className="grid grid-cols-4 rounded-full border border-stone-200 bg-white p-1">
              {TABS.map((t) => (
                <NavLink key={t.href} href={t.href} label={t.label} compact />
              ))}
            </div>
          </nav>
          <Link href="/settings" className="btn-ghost min-h-10 shrink-0 px-4 py-1.5 text-sm">
            Settings
          </Link>
        </div>
        <p className="mx-auto mt-1 max-w-md truncate text-sm text-stone-500 md:max-w-5xl">{shop.name}</p>
      </header>
      <div className="mx-auto max-w-md md:max-w-5xl md:px-2">
        {shop.mode === "LIVE" && !shop.suiAddress && <AddressPrompt />}
        <main className="px-4">{children}</main>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-3 z-10 px-3 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-full border border-stone-200 bg-white/95 p-1 shadow-[0_10px_30px_-12px_rgb(14_15_12/0.35)] backdrop-blur">
          {TABS.map((t) => (
            <NavLink key={t.href} href={t.href} label={t.label} />
          ))}
        </div>
      </nav>
    </div>
  );
}
