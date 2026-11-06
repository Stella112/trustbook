import { createHmac, timingSafeEqual } from "node:crypto";
import type { Draft } from "@trustbook/agent";

/**
 * A confirmation card's contents, signed with APP_SECRET, so the server saves exactly what the owner
 * saw. The card expires after 30 minutes.
 */
export interface SignedDraft {
  shopId: string;
  expiresAt: number;
  entries: Draft["entries"];
  newCustomers: Draft["newCustomers"];
  newItems: Draft["newItems"];
}

function mac(body: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET must be set");
  return createHmac("sha256", secret).update(`draft:${body}`).digest("base64url");
}

export function signDraft(d: Omit<SignedDraft, "expiresAt">): string {
  const body = Buffer.from(JSON.stringify({ ...d, expiresAt: Date.now() + 30 * 60_000 })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function readDraft(token: string): SignedDraft | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const d = JSON.parse(Buffer.from(body, "base64url").toString()) as SignedDraft;
  return d.expiresAt > Date.now() ? d : null;
}
