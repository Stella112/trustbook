"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../src/db/client";
import { hashPin as hashSecret } from "../../src/lib/auth";
import { Email, Password, signInOwner } from "../../src/lib/owner";

export interface SignUpState {
  errors: Partial<Record<"email" | "password" | "passwordConfirm" | "form", string>>;
  email?: string;
}

const Form = z
  .object({ email: Email, password: Password, passwordConfirm: z.string() })
  .refine((f) => f.password === f.passwordConfirm, { path: ["passwordConfirm"], message: "The two passwords do not match" });

/** Creates an owner account with email + password, then goes to shop profile setup. */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const raw = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? ""), passwordConfirm: String(formData.get("passwordConfirm") ?? "") };
  const parsed = Form.safeParse(raw);
  if (!parsed.success) {
    const errors: SignUpState["errors"] = {};
    for (const issue of parsed.error.issues) errors[(issue.path[0] as keyof SignUpState["errors"]) ?? "form"] ??= issue.message;
    return { errors, email: raw.email };
  }
  const [existing] = await db.select({ id: schema.owners.id }).from(schema.owners).where(eq(schema.owners.email, parsed.data.email));
  if (existing) return { errors: { email: "An account with this email already exists. Sign in instead." }, email: raw.email };
  const id = ulid();
  try {
    await db.insert(schema.owners).values({ id, email: parsed.data.email, passwordHash: hashSecret(parsed.data.password) });
  } catch {
    // Two sign-ups with the same email at the same moment: the unique index keeps one.
    return { errors: { email: "An account with this email already exists. Sign in instead." }, email: raw.email };
  }
  redirect(await signInOwner(id));
}
