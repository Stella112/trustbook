import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, schema } from "../db/client";
import { createSession, readSession } from "./auth";
import { SESSION_COOKIE, startSession } from "./shop";

/** The signed-in owner's account (approved 6 Nov: email + password, or Google). */
export const OWNER_COOKIE = "tb_owner";
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address");
export const Password = z.string().min(8, "Use at least 8 characters").max(200, "Use at most 200 characters");

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function currentOwner() {
  const ownerId = readSession((await cookies()).get(OWNER_COOKIE)?.value);
  if (!ownerId) return null;
  const [owner] = await db.select().from(schema.owners).where(eq(schema.owners.id, ownerId));
  return owner ?? null;
}

/**
 * Signs the owner in and, if they already have a shop, opens it. Returns where to go next: the
 * shop's Today screen, or profile setup for a new owner.
 */
export async function signInOwner(ownerId: string): Promise<"/" | "/onboarding"> {
  (await cookies()).set(OWNER_COOKIE, createSession(ownerId), cookieOptions);
  await db.update(schema.owners).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.owners.id, ownerId));
  const [shop] = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.ownerId, ownerId));
  if (!shop) {
    // A new owner must not stay inside someone else's (or the demo) shop.
    (await cookies()).delete(SESSION_COOKIE);
    return "/onboarding";
  }
  await startSession(shop.id);
  return "/";
}

export async function signOutOwner() {
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
  jar.delete(SESSION_COOKIE);
}
