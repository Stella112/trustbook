"use server";

import { eq, like, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "../../src/db/client";
import { MAX_PIN_FAILURES, PIN_LOCK_MINUTES, PIN_PATTERN, verifyPin } from "../../src/lib/auth";
import { startSession } from "../../src/lib/shop";

export interface LoginState {
  error?: string;
  code?: string;
}

const Form = z.object({
  code: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{8}$/, "The shop code has 8 letters and numbers"),
  pin: z.string().regex(PIN_PATTERN, "The PIN has 6 numbers"),
});

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = Form.safeParse({ code: String(formData.get("code") ?? ""), pin: String(formData.get("pin") ?? "") });
  const code = String(formData.get("code") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, code };

  const matches = await db.select().from(schema.shops).where(like(sql`upper(${schema.shops.id})`, `%${parsed.data.code}`));
  // Same message whether the code or the PIN is wrong, so codes cannot be discovered by guessing.
  const wrong = { error: "That shop code and PIN do not match.", code };
  if (matches.length !== 1 || !matches[0]!.pinHash) return wrong;
  const shop = matches[0]!;

  if (shop.pinLockedUntil && shop.pinLockedUntil > new Date()) {
    return { error: `Too many wrong tries. Try again after ${shop.pinLockedUntil.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: shop.timezone })}.`, code };
  }
  if (!verifyPin(parsed.data.pin, shop.pinHash!)) {
    const failures = shop.pinFailures + 1;
    const lock = failures >= MAX_PIN_FAILURES;
    await db
      .update(schema.shops)
      .set({ pinFailures: lock ? 0 : failures, pinLockedUntil: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : shop.pinLockedUntil })
      .where(eq(schema.shops.id, shop.id));
    return lock ? { error: `Too many wrong tries. Your book is locked for ${PIN_LOCK_MINUTES} minutes.`, code } : wrong;
  }
  await db.update(schema.shops).set({ pinFailures: 0, pinLockedUntil: null }).where(eq(schema.shops.id, shop.id));
  await startSession(shop.id);
  redirect("/");
}
