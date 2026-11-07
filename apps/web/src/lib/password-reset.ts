import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { db, schema } from "../db/client";
import { hashPin as hashSecret } from "./auth";
import { sendEmail } from "./mailer";
import { appUrl } from "./paylink";

const RESET_MINUTES = 60;
const MAX_RESETS_PER_HOUR = 3;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Emails a one-time reset link if the account exists. Says nothing either way to the caller. */
export async function requestPasswordReset(email: string): Promise<void> {
  const [owner] = await db.select().from(schema.owners).where(eq(schema.owners.email, email));
  if (!owner) return;
  const recent = await db
    .select({ id: schema.passwordResets.id })
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.ownerId, owner.id), gt(schema.passwordResets.createdAt, new Date(Date.now() - 3_600_000))));
  if (recent.length >= MAX_RESETS_PER_HOUR) return;
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResets).values({ id: ulid(), ownerId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
  // The token is base64url, so the link needs no escaping in text or HTML.
  const link = `${appUrl()}/reset?token=${token}`;
  await sendEmail({
    to: owner.email,
    subject: "Reset your Trustbook password",
    text: `Someone asked to reset the password for your Trustbook account.\n\nOpen this link within ${RESET_MINUTES} minutes to choose a new password:\n${link}\n\nIf it was not you, ignore this email; your password stays the same.`,
    html: `<p>Someone asked to reset the password for your Trustbook account.</p><p><a href="${link}">Choose a new password</a> (the link works once, for ${RESET_MINUTES} minutes).</p><p>If it was not you, ignore this email; your password stays the same.</p>`,
  });
}

/** Uses a reset link once: sets the new password and proves the email. Returns the owner id. */
export async function resetPassword(token: string, newPassword: string): Promise<string | null> {
  const [reset] = await db
    .select()
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.tokenHash, hashToken(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())));
  if (!reset) return null;
  await db.transaction(async (tx) => {
    await tx.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, reset.id));
    await tx
      .update(schema.owners)
      .set({ passwordHash: hashSecret(newPassword), emailVerifiedAt: new Date(), failedLogins: 0, lockedUntil: null })
      .where(eq(schema.owners.id, reset.ownerId));
  });
  return reset.ownerId;
}
