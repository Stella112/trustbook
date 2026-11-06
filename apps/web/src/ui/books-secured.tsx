import { shopStorage } from "@trustbook/memory";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";

const RENEW_WARNING_DAYS = 30;
const longDate = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone });

/**
 * "Books secured until" (brief P1): the earliest expiry among the shop's records on Walrus, read
 * live, plus the last day sealed. Walrus storage lapses unless renewed, and renewing needs the
 * account owner's wallet and WAL, so the app warns ahead of time rather than renewing itself.
 */
export async function BooksSecured({ shopId, timezone }: { shopId: string; timezone: string }) {
  const [last] = await db.select({ toDate: schema.seals.toDate, sealedAt: schema.seals.sealedAt }).from(schema.seals).where(eq(schema.seals.shopId, shopId)).orderBy(desc(schema.seals.toDate)).limit(1);
  let storage: Awaited<ReturnType<typeof shopStorage>> | null = null;
  try {
    storage = await shopStorage(shopId);
  } catch {
    storage = null;
  }
  const daysLeft = storage?.securedUntil ? Math.floor((Date.parse(storage.securedUntil) - Date.now()) / 86_400_000) : null;
  const warn = daysLeft !== null && daysLeft <= RENEW_WARNING_DAYS;

  return (
    <div className={`rounded-xl p-4 shadow-sm ${warn ? "bg-red-50 text-red-900" : "bg-white"}`}>
      {storage?.securedUntil ? (
        <p className="text-lg font-semibold">Books secured on Walrus until {longDate(storage.securedUntil, timezone)}</p>
      ) : (
        <p className="text-lg font-semibold">{storage ? "Storage dates not known yet" : "Could not check Walrus right now"}</p>
      )}
      <p className="mt-1 text-sm text-stone-700">
        {last ? `Last day saved: ${longDate(`${last.toDate}T12:00:00Z`, "UTC")}.` : "Nothing saved yet; days are saved each night."}
        {storage ? ` ${storage.records} records stored${storage.expiryUnknown ? `, ${storage.expiryUnknown} too new to show a date` : ""}.` : ""}
      </p>
      {warn && <p className="mt-1 text-sm font-semibold">Storage ends in {daysLeft} days. Renew it from the shop&apos;s Walrus account before then, or the oldest records will be lost.</p>}
    </div>
  );
}
