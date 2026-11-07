"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, compact }: { href: string; label: string; compact?: boolean }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`) || (href === "/today" && path.startsWith("/record"));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full text-center font-medium transition-colors ${compact ? "px-5 py-2 text-sm" : "py-3 text-[15px]"} ${active ? "bg-emerald-700 text-white" : "text-stone-600 hover:bg-stone-100"}`}
    >
      {label}
    </Link>
  );
}
