import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { MAX_PIN_FAILURES, PIN_LOCK_MINUTES, PIN_PATTERN, verifyPin } from "./auth";

/**
 * The owner's 6-number PIN approves money actions (approved 6 Nov), such as marking a debt as
 * paid. The demo shop has no PIN, so it never asks. Five wrong PINs lock money actions for 15 minutes.
 */
export type PinCheck = "ok" | "not-needed" | "missing" | "wrong" | "locked";

type ShopPin = { id: string; pinHash: string | null; pinFailures: number; pinLockedUntil: Date | null };

export const pinRequired = (shop: Pick<ShopPin, "pinHash">) => shop.pinHash !== null;

export async function checkPin(shop: ShopPin, pin: string | null | undefined): Promise<PinCheck> {
  if (!shop.pinHash) return "not-needed";
  if (shop.pinLockedUntil && shop.pinLockedUntil > new Date()) return "locked";
  if (!pin || !PIN_PATTERN.test(pin)) return "missing";
  if (verifyPin(pin, shop.pinHash)) {
    if (shop.pinFailures) await db.update(schema.shops).set({ pinFailures: 0, pinLockedUntil: null }).where(eq(schema.shops.id, shop.id));
    return "ok";
  }
  const failures = shop.pinFailures + 1;
  const lock = failures >= MAX_PIN_FAILURES;
  await db
    .update(schema.shops)
    .set({ pinFailures: lock ? 0 : failures, pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : null })
    .where(eq(schema.shops.id, shop.id));
  return lock ? "locked" : "wrong";
}

export const PIN_MESSAGES: Record<Exclude<PinCheck, "ok" | "not-needed">, string> = {
  missing: "Type your 6-number PIN to approve this.",
  wrong: "That PIN is not right.",
  locked: `Too many wrong PINs. Money actions are locked for ${PIN_LOCK_MINUTES} minutes.`,
};
