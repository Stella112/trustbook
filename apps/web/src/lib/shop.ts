import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "../db/client";

export const SHOP_COOKIE = "tb_shop";

/**
 * The shop this browser is working with. Phase 1 has no owner login: the brief does not specify
 * one, so the shop is chosen by an httpOnly cookie set at onboarding. Flagged in the Gate 1 report.
 */
export async function currentShop() {
  const id = (await cookies()).get(SHOP_COOKIE)?.value;
  if (!id) return null;
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, id));
  return shop ?? null;
}

export async function rememberShop(shopId: string) {
  (await cookies()).set(SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
