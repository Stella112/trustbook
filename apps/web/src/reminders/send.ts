import { computeDebts, effectiveEntries, formatNaira, localDate, remindersDue, validateEntry } from "@trustbook/ledger";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { emailConfigured, sendEmail } from "../lib/mailer";
import { appUrl, signPayLink, whatsappLink } from "../lib/paylink";
import { reminderMessage } from "../lib/reminder";
import QRCode from "qrcode";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Claims a reminder slot before sending, so two runs on the same day never send it twice. */
async function claim(shopId: string, customerId: string, date: string): Promise<boolean> {
  const rows = await db.insert(schema.remindersSent).values({ shopId, customerId, date, channel: "email" }).onConflictDoNothing().returning({ c: schema.remindersSent.customerId });
  return rows.length > 0;
}
const release = (shopId: string, customerId: string, date: string) =>
  db.delete(schema.remindersSent).where(and(eq(schema.remindersSent.shopId, shopId), eq(schema.remindersSent.customerId, customerId), eq(schema.remindersSent.date, date)));

export interface ReminderRun {
  skipped?: string;
  customersEmailed: number;
  ownersEmailed: number;
  failed: number;
}

/**
 * The morning reminders. A customer with an email is reminded on the day they promised to pay; the
 * owner gets one summary of everyone due today or late, with a WhatsApp link for each. WhatsApp
 * itself cannot be sent automatically without its paid Business API (out of scope), so the owner
 * taps those. Demo shops are skipped: their customers are not real people.
 */
export async function sendDueReminders(): Promise<ReminderRun> {
  const run: ReminderRun = { customersEmailed: 0, ownersEmailed: 0, failed: 0 };
  if (!emailConfigured()) return { ...run, skipped: "email is not set up (SMTP_USER / SMTP_PASSWORD)" };
  const shops = await db.select().from(schema.shops).where(eq(schema.shops.mode, "LIVE"));
  for (const shop of shops) {
    const today = localDate(new Date().toISOString(), shop.timezone);
    const [rows, customers, [owner]] = await Promise.all([
      db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.occurredAt)),
      db.select().from(schema.customers).where(eq(schema.customers.shopId, shop.id)),
      shop.ownerId ? db.select({ email: schema.owners.email }).from(schema.owners).where(eq(schema.owners.id, shop.ownerId)) : Promise.resolve([]),
    ]);
    const settings = { shopId: shop.id, timezone: shop.timezone, openingCashKobo: shop.openingCashKobo, defaultDueDays: shop.defaultDueDays };
    const debts = computeDebts(effectiveEntries(rows.map((r) => validateEntry(r.data))), settings, today);
    const due = remindersDue(debts, today);
    if (!due.length) continue;
    const lines: { name: string; text: string; whatsapp: string | null }[] = [];
    for (const r of due) {
      const c = customers.find((x) => x.id === r.customerId);
      if (!c) continue;
      const payUrl = `${appUrl()}/p/${signPayLink({ shopId: shop.id, customerId: c.id, amountKobo: r.owedKobo })}`;
      const message = reminderMessage({ customerName: c.name, shopName: shop.name, due: r, payUrl });
      lines.push({ name: c.name, text: r.dueTodayKobo > 0 ? `promised ${formatNaira(r.dueTodayKobo)} today` : `${formatNaira(r.overdueKobo)}, ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} late`, whatsapp: c.phone ? whatsappLink(c.phone, message) : null });
      // The customer is emailed on the promised day itself, once.
      if (c.email && r.dueTodayKobo > 0 && (await claim(shop.id, c.id, today))) {
        try {
          // A QR of the same pay link, for a customer reading the email on a laptop who pays from the wallet on their phone.
          const qr = await QRCode.toBuffer(payUrl, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 240 });
          await sendEmail({
            to: c.email,
            subject: `Reminder from ${shop.name}: payment due today`,
            text: message,
            html:
              `<p>${escape(message).replace(escape(payUrl), `<a href="${escape(payUrl)}">${escape(payUrl)}</a>`)}</p>` +
              `<p><img src="cid:payqr" width="200" height="200" alt="QR code that opens the pay page"><br>Or scan this with your phone's camera to open the pay page.</p>`,
            images: [{ cid: "payqr", filename: "pay-qr.png", content: qr }],
          });
          run.customersEmailed++;
        } catch (err) {
          await release(shop.id, c.id, today);
          run.failed++;
          console.error(`reminder email to customer ${c.id} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
    if (owner?.email && lines.length && (await claim(shop.id, "owner", today))) {
      const list = lines.map((l) => `- ${l.name}: ${l.text}${l.whatsapp ? `\n  WhatsApp: ${l.whatsapp}` : " (no phone number yet)"}`).join("\n");
      try {
        await sendEmail({
          to: owner.email,
          subject: `${lines.length} customer${lines.length === 1 ? "" : "s"} to remind today`,
          text: `Good morning. These customers promised to pay today or are late:\n\n${list}\n\nOpen Trustbook: ${appUrl()}/`,
          html: `<p>Good morning. These customers promised to pay today or are late:</p><ul>${lines
            .map((l) => `<li><strong>${escape(l.name)}</strong>: ${escape(l.text)}${l.whatsapp ? ` · <a href="${escape(l.whatsapp)}">Send WhatsApp reminder</a>` : " (no phone number yet)"}</li>`)
            .join("")}</ul><p><a href="${escape(appUrl())}/">Open Trustbook</a></p>`,
        });
        run.ownersEmailed++;
      } catch (err) {
        await release(shop.id, "owner", today);
        run.failed++;
        console.error(`reminder summary to owner of ${shop.id} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return run;
}
