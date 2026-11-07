"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, ChartIcon, HomeIcon, SparkIcon, TruckIcon } from "../../src/ui/icons";

export type TabIcon = "home" | "book" | "truck" | "chart" | "spark";
const ICONS = { home: HomeIcon, book: BookIcon, truck: TruckIcon, chart: ChartIcon, spark: SparkIcon };

/** Which section a screen belongs to, so the right tab lights up on detail screens too. */
const SECTION: Record<string, string[]> = {
  "/today": ["/today", "/record", "/day"],
  "/customers": ["/customers"],
  "/suppliers": ["/suppliers"],
  "/capital": ["/capital", "/month"],
  "/ask": ["/ask"],
};

export function NavLink({ href, label, icon, compact }: { href: string; label: string; icon: TabIcon; compact?: boolean }) {
  const path = usePathname();
  const active = (SECTION[href] ?? [href]).some((p) => path === p || path.startsWith(`${p}/`));
  const Icon = ICONS[icon];
  if (compact) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-emerald-700 text-white" : "text-stone-600 hover:bg-stone-100"}`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-1 pb-3 pt-2.5 text-xs font-medium ${active ? "text-emerald-800" : "text-stone-500"}`}>
      <Icon className="h-6 w-6" />
      {label}
      {active && <span className="absolute bottom-1 h-1 w-10 rounded-full bg-emerald-700" />}
    </Link>
  );
}
