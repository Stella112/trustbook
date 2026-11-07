import type { TrustLabel } from "@trustbook/ledger";
import type { ReactNode } from "react";

export function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-100 p-4">
      <div className="text-sm text-stone-600">{label}</div>
      <div className={`mt-1 font-display text-[1.7rem] leading-tight ${tone === "warn" ? "text-red-700" : tone === "good" ? "text-emerald-800" : "text-stone-900"}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-stone-600">{note}</div>}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const LABEL_STYLE: Record<TrustLabel, string> = {
  "Good payer": "bg-emerald-100 text-emerald-900",
  "Sometimes late": "bg-amber-100 text-amber-900",
  Careful: "bg-red-100 text-red-900",
  New: "bg-stone-200 text-stone-800",
};

export function LabelBadge({ label, overridden }: { label: TrustLabel; overridden?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${LABEL_STYLE[label]}`}>
      {label}
      {overridden ? " (set by you)" : ""}
    </span>
  );
}

/** "Thu 5 Nov" from "2026-11-05". */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "10:42" in the shop's timezone. */
export function timeOf(instant: string, timezone: string): string {
  return new Date(instant).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone });
}
