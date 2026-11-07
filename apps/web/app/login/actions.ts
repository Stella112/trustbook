"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "../../src/db/client";
import { verifyPin as verifySecret } from "../../src/lib/auth";
import { Email, LOGIN_LOCK_MINUTES, MAX_LOGIN_FAILURES, signInOwner } from "../../src/lib/owner";

export interface LoginState {
  error?: string;
  email?: string;
}

const Form = z.object({ email: Email, password: z.string().min(1, "Enter your password").max(200) });

/** Email + password sign-in, with a 15-minute lock after 5 wrong passwords. */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = Form.safeParse({ email, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };

  // The same message for an unknown email and a wrong password, so accounts cannot be discovered.
  const wrong = { error: "That email and password do not match.", email };
  const [owner] = await db.select().from(schema.owners).where(eq(schema.owners.email, parsed.data.email));
  if (!owner) return wrong;
  if (owner.lockedUntil && owner.lockedUntil > new Date()) {
    return { error: `Too many wrong tries. Try again after ${owner.lockedUntil.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}, or reset your password.`, email };
  }
  if (!owner.passwordHash) return { error: "This account signs in with Google. Use Continue with Google, or reset your password to add one.", email };
  if (!verifySecret(parsed.data.password, owner.passwordHash)) {
    const failures = owner.failedLogins + 1;
    const lock = failures >= MAX_LOGIN_FAILURES;
    await db
      .update(schema.owners)
      .set({ failedLogins: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : owner.lockedUntil })
      .where(eq(schema.owners.id, owner.id));
    return lock ? { error: `Too many wrong tries. Sign-in is locked for ${LOGIN_LOCK_MINUTES} minutes.`, email } : wrong;
  }
  redirect(await signInOwner(owner.id));
}
