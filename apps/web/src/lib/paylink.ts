import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Pay link payload (brief §6.5): signed with APP_SECRET, expiring, never a lookup by phone number. */
export const PayLink = z.object({
  shopId: z.string(),
  customerId: z.string(),
  saleId: z.string().optional(),
  amountKobo: z.number().int().positive(),
  expiresAt: z.number().int(),
});
export type PayLink = z.infer<typeof PayLink>;

function mac(body: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET must be set");
  return createHmac("sha256", secret).update(`pay:${body}`).digest("base64url");
}

export function signPayLink(p: Omit<PayLink, "expiresAt">, days = 7): string {
  const body = Buffer.from(JSON.stringify({ ...p, expiresAt: Date.now() + days * 86_400_000 })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readPayLink(token: string): PayLink | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const parsed = PayLink.safeParse(JSON.parse(Buffer.from(body, "base64url").toString()));
  return parsed.success && parsed.data.expiresAt > Date.now() ? parsed.data : null;
}

/** The public base URL for links sent to customers. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, "");
}

/** WhatsApp click-to-chat (brief §4.5): digits only, message URL-encoded. Sent from the owner's own phone. */
export function whatsappLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return intl.length >= 10 ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}` : null;
}
