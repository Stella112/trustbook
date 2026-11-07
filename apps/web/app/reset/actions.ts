"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Password, signInOwner } from "../../src/lib/owner";
import { resetPassword } from "../../src/lib/password-reset";

export interface ResetState {
  errors: Partial<Record<"password" | "passwordConfirm" | "form", string>>;
}

const Form = z
  .object({ token: z.string().min(20).max(200), password: Password, passwordConfirm: z.string() })
  .refine((f) => f.password === f.passwordConfirm, { path: ["passwordConfirm"], message: "The two passwords do not match" });

export async function choosePassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = Form.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });
  if (!parsed.success) {
    const errors: ResetState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === "password" || issue.path[0] === "passwordConfirm" ? issue.path[0] : "form";
      errors[key] ??= key === "form" ? "This reset link is not valid." : issue.message;
    }
    return { errors };
  }
  const ownerId = await resetPassword(parsed.data.token, parsed.data.password);
  if (!ownerId) return { errors: { form: "This reset link has expired or was already used." } };
  redirect(await signInOwner(ownerId));
}
