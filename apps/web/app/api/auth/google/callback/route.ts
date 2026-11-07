import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../../../../src/db/client";
import { readSession } from "../../../../../src/lib/auth";
import { exchangeGoogleCode } from "../../../../../src/lib/google";
import { signInOwner } from "../../../../../src/lib/owner";
import { appUrl } from "../../../../../src/lib/paylink";

export const dynamic = "force-dynamic";

const Query = z.object({ code: z.string().min(1).max(2000), state: z.string().min(10).max(200) });
const back = (path: string) => NextResponse.redirect(new URL(path, appUrl()));

/**
 * Google's return. Finds the owner by Google id, else by verified email (linking the two), else
 * creates one. Linking to an email-and-password account whose email was never proven removes that
 * password: whoever registered it first cannot keep a way into the real owner's shop.
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const saved = readSession(jar.get("tb_google")?.value);
  jar.delete({ name: "tb_google", path: "/api/auth/google" });
  const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!saved || !q.success) return back("/login?m=google");
  const [state, nonce] = saved.split(":");
  if (!state || !nonce || state !== q.data.state) return back("/login?m=google");

  let claims;
  try {
    claims = await exchangeGoogleCode(q.data.code, nonce);
  } catch (err) {
    console.error("google sign-in:", err instanceof Error ? err.message : err);
    return back("/login?m=google");
  }
  if (!claims.email_verified) return back("/login?m=google-email");
  const email = claims.email.toLowerCase();

  let [owner] = await db.select().from(schema.owners).where(eq(schema.owners.googleSub, claims.sub));
  if (!owner) {
    const [byEmail] = await db.select().from(schema.owners).where(eq(schema.owners.email, email));
    if (byEmail) {
      await db
        .update(schema.owners)
        .set({ googleSub: claims.sub, emailVerifiedAt: new Date(), ...(byEmail.emailVerifiedAt ? {} : { passwordHash: null }) })
        .where(eq(schema.owners.id, byEmail.id));
      owner = byEmail;
    } else {
      const id = ulid();
      await db.insert(schema.owners).values({ id, email, googleSub: claims.sub, emailVerifiedAt: new Date() });
      [owner] = await db.select().from(schema.owners).where(eq(schema.owners.id, id));
    }
  }
  return back(await signInOwner(owner!.id));
}
