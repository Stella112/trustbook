import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Hashes a PIN with scrypt and a random salt: "scrypt$<salt>$<hash>". */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(pin, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set to at least 32 characters");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** A session token "<shopId>.<expiresMs>.<hmac>", signed with APP_SECRET. */
export function createSession(shopId: string, days = 365): string {
  const payload = `${shopId}.${Date.now() + days * 86_400_000}`;
  return `${payload}.${sign(payload)}`;
}

/** The shop id in a valid, unexpired session token, or null. */
export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  const last = token.lastIndexOf(".");
  if (last < 0) return null;
  const payload = token.slice(0, last);
  const given = Buffer.from(token.slice(last + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const dot = payload.lastIndexOf(".");
  const shopId = payload.slice(0, dot);
  const expires = Number(payload.slice(dot + 1));
  return shopId && Number.isFinite(expires) && expires > Date.now() ? shopId : null;
}

/** The last 8 characters of a shop's id, shown to the owner as their shop code for signing in. */
export const shopCodeOf = (shopId: string) => shopId.slice(-8).toUpperCase();

export const PIN_PATTERN = /^\d{6}$/;
export const MAX_PIN_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;
