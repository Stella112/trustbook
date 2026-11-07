import { createPublicKey, randomBytes, verify } from "node:crypto";
import { z } from "zod";
import { appUrl } from "./paylink";

/**
 * "Continue with Google" for shop owners (approved 6 Nov): plain OpenID Connect sign-in, not the
 * wallet zkLogin. Endpoints come from https://accounts.google.com/.well-known/openid-configuration
 * (read 6 Nov): issuer https://accounts.google.com, RS256 ID tokens.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirectUri = () => `${appUrl()}/api/auth/google/callback`;
export const randomToken = () => randomBytes(24).toString("base64url");

export function googleAuthUrl(state: string, nonce: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${q}`;
}

const Claims = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  exp: z.number(),
  nonce: z.string().optional(),
});
export type GoogleClaims = z.infer<typeof Claims>;

async function verifySignature(idToken: string): Promise<unknown> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("malformed ID token");
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("unexpected ID token algorithm");
  const jwks = (await (await fetch(JWKS_URL)).json()) as { keys: ({ kid?: string } & Record<string, unknown>)[] };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Google key not found");
  // Google's JWKS entries are standard RSA JSON Web Keys; Node reads them with format "jwk".
  const publicKey = createPublicKey({ key: jwk, format: "jwk" } as Parameters<typeof createPublicKey>[0]);
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("ID token signature is not valid");
  return JSON.parse(Buffer.from(p, "base64url").toString());
}

/** Swaps the code for an ID token and checks it fully: signature, issuer, audience, expiry, nonce. */
export async function exchangeGoogleCode(code: string, nonce: string): Promise<GoogleClaims> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
  });
  const body = (await r.json()) as { id_token?: string; error?: string };
  if (!r.ok || !body.id_token) throw new Error(`Google token exchange failed: ${body.error ?? r.status}`);
  const claims = Claims.parse(await verifySignature(body.id_token));
  if (!ISSUERS.includes(claims.iss)) throw new Error("wrong issuer");
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("token is for another app");
  if (claims.exp * 1000 < Date.now()) throw new Error("token expired");
  if (claims.nonce !== nonce) throw new Error("nonce mismatch");
  return claims;
}
