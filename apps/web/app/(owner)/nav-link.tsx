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
      className={`py-4 text-center text-base font-semibold ${active ? "text-emerald-800" : "text-stone-500"}`}
    >
      {label}
    </Link>
  );
}
