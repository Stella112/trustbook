import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "../db/client";
import { createSession, readSession } from "./auth";

export const SESSION_COOKIE = "tb_session";

/** The shop this browser is signed in to, from a signed session cookie. */
export async function currentShop() {
  const shopId = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!shopId) return null;
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  return shop ?? null;
}

export async function startSession(shopId: string) {
  (await cookies()).set(SESSION_COOKIE, createSession(shopId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
