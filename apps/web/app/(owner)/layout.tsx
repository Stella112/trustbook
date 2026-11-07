import Link from "next/link";
import type { ReactNode } from "react";
import { loadBook } from "../../src/lib/book";
import { GearIcon } from "../../src/ui/icons";
import { Logo } from "../../src/ui/logo";
import { AddressPrompt } from "./address-prompt";
import { NavLink, type TabIcon } from "./nav-link";

export const dynamic = "force-dynamic";

/** The five sections of the app (approved 7 Nov). Settings stays at the top. */
const TABS: { href: string; label: string; short: string; icon: TabIcon }[] = [
  { href: "/today", label: "Home", short: "Home", icon: "home" },
  { href: "/customers", label: "Credit Book", short: "Credit", icon: "book" },
  { href: "/suppliers", label: "Suppliers", short: "Suppliers", icon: "truck" },
  { href: "/capital", label: "Capital & Profit", short: "Capital", icon: "chart" },
  { href: "/ask", label: "Ask Trustbook", short: "Ask", icon: "spark" },
];

/**
 * The app frame. Phones: one column on a cream page with a bottom tab bar that reserves its own space,
 * so it never covers content. Computers: a wider page with the sections in the header.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const { shop } = await loadBook();
  return (
    <div className="min-h-screen bg-stone-50 pb-28 md:pb-16">
      {shop.mode === "DEMO" && (
        <p className="bg-lime px-4 py-2 text-center text-sm font-medium text-emerald-900">Demo data · a sample shop, not a real business</p>
      )}
      <header className="sticky top-0 z-10 bg-stone-50/90 px-4 pb-3 pt-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4 md:max-w-6xl">
          <Link href="/today" aria-label="Home" className="flex min-w-0 items-center gap-3">
            <span className="min-w-0">
              <Logo className="text-2xl" />
              <span className="block truncate text-sm text-stone-600">
                {shop.name} · {shop.mode === "DEMO" ? "Demo shop" : "Your shop"}
              </span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex">
            <div className="flex rounded-full border border-stone-200 bg-white p-1">
              {TABS.map((t) => (
                <NavLink key={t.href} href={t.href} label={t.label} icon={t.icon} compact />
              ))}
            </div>
          </nav>
          <Link href="/settings" aria-label="Settings" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-stone-200 bg-emerald-50 text-emerald-900">
            <GearIcon className="h-6 w-6" />
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-6xl md:px-2">
        {shop.mode === "LIVE" && !shop.suiAddress && <AddressPrompt />}
        <main className="px-4">{children}</main>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 md:max-w-3xl">
          {TABS.map((t) => (
            <NavLink key={t.href} href={t.href} label={t.short} icon={t.icon} />
          ))}
        </div>
      </nav>
    </div>
  );
}
