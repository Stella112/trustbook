"use server";

import { z } from "zod";
import { emailConfigured } from "../../src/lib/mailer";
import { Email } from "../../src/lib/owner";
import { requestPasswordReset } from "../../src/lib/password-reset";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

export async function forgotPassword(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.object({ email: Email }).safeParse({ email: String(formData.get("email") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (!emailConfigured()) return { error: "Password reset by email is not set up yet. If your account uses a Google email, sign in with Google." };
  try {
    await requestPasswordReset(parsed.data.email);
  } catch (err) {
    console.error("password reset email:", err instanceof Error ? err.message : err);
    return { error: "Could not send the email right now. Please try again in a few minutes." };
  }
  return { sent: true };
}
