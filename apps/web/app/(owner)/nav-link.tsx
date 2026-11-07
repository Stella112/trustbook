"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full py-3 text-center text-[15px] font-medium transition-colors ${active ? "bg-emerald-700 text-white" : "text-stone-600 hover:bg-stone-100"}`}
    >
      {label}
    </Link>
  );
}
