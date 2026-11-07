import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "../../../../src/lib/auth";
import { googleAuthUrl, googleConfigured, randomToken } from "../../../../src/lib/google";
import { appUrl } from "../../../../src/lib/paylink";

export const dynamic = "force-dynamic";

const GOOGLE_COOKIE = "tb_google";

/** Starts Google sign-in. A signed, short-lived cookie holds the state and nonce to check on return. */
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?m=google", appUrl()));
  const state = randomToken();
  const nonce = randomToken();
  (await cookies()).set(GOOGLE_COOKIE, createSession(`${state}:${nonce}`, 10 / 1440), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl(state, nonce));
}
