import { addDays, daySummary, formatNaira, positionAt, remindersDue, type ReplaceableEntry } from "@trustbook/ledger";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema } from "../../../src/db/client";
import { loadBook, type Book } from "../../../src/lib/book";
import { appUrl, signPayLink, whatsappLink } from "../../../src/lib/paylink";
import { reminderMessage } from "../../../src/lib/reminder";
import { describeEntry } from "../../../src/ui/entry-line";
import {
  ArrowIcon,
  BasketIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  MicIcon,
  PlusIcon,
  PulseIcon,
  ReceiptIcon,
  TruckIcon,
  WalletIcon,
} from "../../../src/ui/icons";
import { LessonTip } from "../../../src/ui/lesson-tip";
import { timeOf } from "../../../src/ui/kit";

const longDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Home: today's money at a glance, the big Record button, who to follow up, and what happened last.
 * Every figure is computed from the ledger; "today" figures and running balances are labelled apart.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const book = await loadBook();
  const { entries, settings, today, debts } = book;
  const day = daySummary(entries, settings, today);
  const yesterday = daySummary(entries, settings, addDays(today, -1));
  const position = positionAt(entries, settings, today);
  // Shown only when there is a yesterday to compare with; a percentage, not money.
  const change = yesterday.revenueKobo > 0 ? Math.round(((day.revenueKobo - yesterday.revenueKobo) * 100) / yesterday.revenueKobo) : null;

  const due = remindersDue(debts, today);
  const emailed = new Set(
    (await db.select({ customerId: schema.remindersSent.customerId }).from(schema.remindersSent).where(and(eq(schema.remindersSent.shopId, book.shop.id), eq(schema.remindersSent.date, today)))).map(
      (r) => r.customerId,
    ),
  );
  const followUps = due.map((r) => {
    const customer = book.customers.find((c) => c.id === r.customerId);
    const payUrl = `${appUrl()}/p/${signPayLink({ shopId: book.shop.id, customerId: r.customerId, amountKobo: r.owedKobo })}`;
    const message = reminderMessage({ customerName: customer?.name ?? "there", shopName: book.shop.name, due: r, payUrl });
    return { ...r, name: customer?.name ?? "Unknown customer", whatsapp: customer?.phone ? whatsappLink(customer.phone, message) : null, emailed: emailed.has(r.customerId) };
  });
  const recent = entries
    .filter((e): e is ReplaceableEntry => e.type !== "CORRECTION" && e.type !== "STOCK_ADJUST")
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="space-y-4 pt-1">
      {saved && (
        <p role="status" className="rounded-xl bg-emerald-100 px-4 py-3 font-semibold text-emerald-900">
          {saved === "already" ? "That was already saved." : "Saved to your book. ✓"}
        </p>
      )}

      {/* Today's money */}
      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <div className="flex items-center gap-2 bg-emerald-50 px-5 py-3 text-emerald-900">
          <CalendarIcon className="h-5 w-5" />
          <h1 className="font-sans text-base font-semibold tracking-normal">
            Today <span className="font-normal text-stone-700">· {longDate(today)}</span>
          </h1>
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-600">Total sales today</div>
            {change !== null && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${change >= 0 ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
                {change >= 0 ? "↑" : "↓"} {change >= 0 ? "+" : ""}
                {change}% vs yesterday
              </span>
            )}
          </div>
          <div className="mt-1 font-display text-5xl leading-none text-stone-900">{formatNaira(day.revenueKobo)}</div>
          <p className="mt-2 text-[15px] text-stone-700">
            Collected <span className="font-semibold">{formatNaira(day.cashCollectedKobo)}</span> · Credit <span className="font-semibold">{formatNaira(day.creditGivenKobo)}</span>
            {day.expensesKobo + day.purchasesKobo > 0 && (
              <>
                {" "}
                · Spent <span className="font-semibold">{formatNaira(day.expensesKobo + day.purchasesKobo)}</span>
              </>
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
            <Link href="/customers" className="flex gap-3 rounded-2xl bg-emerald-50 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <WalletIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-stone-700">Owed to you</span>
                <span className="block break-all font-display text-xl leading-tight sm:text-2xl">{formatNaira(position.receivablesKobo)}</span>
                <span className="block text-xs text-stone-500">All customers, all time</span>
              </span>
            </Link>
            <Link href="/customers" className="flex gap-3 rounded-2xl bg-[#fbeee0] p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f6dcc2] text-[#8a4b12]">
                <ClockIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-stone-700">Overdue</span>
                <span className={`block break-all font-display text-xl leading-tight sm:text-2xl ${position.overdueKobo > 0 ? "text-red-700" : ""}`}>{formatNaira(position.overdueKobo)}</span>
                <span className="block text-xs text-stone-500">{position.overdueKobo > 0 ? "Needs follow-up" : "Nobody is late"}</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Record */}
      <section className="grid grid-cols-[1fr_auto] gap-3">
        <Link href="/record" className="flex flex-col items-center justify-center gap-1 rounded-3xl bg-emerald-700 px-4 py-4 text-center text-white">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <PlusIcon className="h-6 w-6" /> Record something
          </span>
          <span className="text-xs text-white/85">Type or speak a sale, payment, expense or stock purchase.</span>
        </Link>
        <Link href="/record#voice" className="flex w-28 flex-col items-center justify-center gap-1 rounded-3xl border border-stone-200 bg-stone-100 px-3 py-4 text-emerald-800">
          <MicIcon className="h-6 w-6" />
          <span className="font-semibold text-stone-900">Voice</span>
        </Link>
      </section>

      <Suspense fallback={null}>
        <LessonTip book={book} />
      </Suspense>

      {/* Customers to follow up */}
      <Card
        icon={<BellIcon className="h-5 w-5" />}
        title="Customers to follow up"
        action={followUps.length > 3 ? <SeeAll href="/customers" /> : null}
        tone="amber"
      >
        {followUps.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-stone-700">
            <CheckIcon className="h-5 w-5 text-emerald-700" /> Nobody is due today, and nobody is late.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {followUps.slice(0, 3).map((r) => (
              <li key={r.customerId} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={r.name} />
                <Link href={`/customers/${r.customerId}`} className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{r.name}</span>
                  <span className="block truncate text-sm text-stone-600">
                    {r.dueTodayKobo > 0 ? `Due today · ${formatNaira(r.dueTodayKobo)}` : `Overdue · ${formatNaira(r.overdueKobo)}`}
                    {r.emailed ? " · emailed" : ""}
                  </span>
                </Link>
                <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${r.dueTodayKobo > 0 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"}`}>
                  {r.dueTodayKobo > 0 ? "Due today" : `${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} late`}
                </span>
                {r.whatsapp ? (
                  <a href={r.whatsapp} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800">
                    Remind
                  </a>
                ) : (
                  <Link href={`/customers/${r.customerId}#contact`} className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
                    Add phone
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent activity */}
      <Card icon={<PulseIcon className="h-5 w-5" />} title="Recent activity" action={<SeeAll href={`/day/${today}`} />}>
        {recent.length === 0 ? (
          <p className="px-5 py-4 text-stone-700">Nothing recorded yet. Tap Record something to start your book.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((e) => (
              <Activity key={e.id} e={e} book={book} />
            ))}
          </ul>
        )}
      </Card>

      <Link href={`/day/${today}`} className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-medium text-stone-900">
        <span className="flex items-center gap-3">
          <ReceiptIcon className="h-5 w-5 text-emerald-800" /> View full book
        </span>
        <ChevronIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}

function Card({ icon, title, action, tone, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; tone?: "amber"; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
      <div className={`flex items-center justify-between px-5 py-3 ${tone === "amber" ? "bg-[#fdf3e7]" : "bg-stone-50"}`}>
        <h2 className="flex items-center gap-2 font-sans text-lg font-semibold tracking-normal">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-medium text-stone-700">
      See all <ArrowIcon className="h-4 w-4 text-[#a35a1c]" />
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-lg font-semibold text-white">{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

/** One recent entry: icon, words, amount and a status pill. */
function Activity({ e, book }: { e: ReplaceableEntry; book: Book }) {
  const { title, detail, amount } = describeEntry(e, book);
  const pill =
    e.type === "SALE"
      ? e.totalKobo > e.paidNowKobo
        ? { text: "On credit", cls: "bg-amber-100 text-amber-900" }
        : { text: "Paid", cls: "bg-emerald-100 text-emerald-900" }
      : e.type === "PAYMENT"
        ? { text: e.method === "sui" ? "Sui" : e.method === "cash" ? "Cash" : "Transfer", cls: "bg-emerald-100 text-emerald-900" }
        : e.type === "PURCHASE"
          ? { text: e.paidNowKobo < e.totalKobo ? "Owed" : "Stock", cls: "bg-stone-200 text-stone-800" }
          : e.type === "EXPENSE" || e.type === "SUPPLIER_PAYMENT" || e.type === "OWNER_OUT"
            ? { text: "Out", cls: "bg-stone-200 text-stone-800" }
            : null;
  const Icon = e.type === "SALE" ? BasketIcon : e.type === "PAYMENT" ? CheckIcon : e.type === "PURCHASE" || e.type === "SUPPLIER_PAYMENT" ? TruckIcon : ReceiptIcon;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-800">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-sm text-stone-600">
          {detail ? `${detail} · ` : ""}
          {timeOf(e.occurredAt, book.shop.timezone)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-semibold">{amount}</span>
        {pill && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>{pill.text}</span>}
      </span>
    </li>
  );
}
