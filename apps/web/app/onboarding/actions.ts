"use server";

import { parseNairaToKobo } from "@trustbook/ledger";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../../src/db/client";
import { hashPin, PIN_PATTERN } from "../../src/lib/auth";
import { currentOwner } from "../../src/lib/owner";
import { startSession } from "../../src/lib/shop";
import { DEMO_SHOP_ID } from "../../src/seed/demo";

type Field = "shopName" | "ownerName" | "currency" | "openingCash" | "suiAddress" | "pin" | "pinConfirm" | "form";
export interface OnboardingState {
  errors: Partial<Record<Field, string>>;
  values?: Record<string, string>;
}

const Form = z
  .object({
    shopName: z.string().trim().min(2, "Enter your shop's name").max(80, "Keep the name under 80 letters"),
    ownerName: z.string().trim().min(1, "Enter your name").max(80, "Keep the name under 80 letters"),
    currency: z.literal("NGN", { error: "Only naira (NGN) is supported for now" }),
    openingCash: z.string().trim().transform((s, ctx) => {
      const kobo = parseNairaToKobo(s === "" ? "0" : s);
      if (kobo === null) {
        ctx.addIssue({ code: "custom", message: "Write the amount like 150,000 or 150k" });
        return z.NEVER;
      }
      return kobo;
    }),
    suiAddress: z.string().trim().transform((s, ctx) => {
      if (s === "") return null;
      if (!/^0x[0-9a-fA-F]{64}$/.test(s) || !isValidSuiAddress(s)) {
        ctx.addIssue({ code: "custom", message: "A Sui address starts with 0x and has 64 letters and numbers after it" });
        return z.NEVER;
      }
      return normalizeSuiAddress(s);
    }),
    pin: z.string().regex(PIN_PATTERN, "Choose a PIN of exactly 6 numbers"),
    pinConfirm: z.string(),
  })
  .refine((f) => f.pin === f.pinConfirm, { path: ["pinConfirm"], message: "The two PINs do not match" });

const FIELDS = ["shopName", "ownerName", "currency", "openingCash", "suiAddress", "pin", "pinConfirm"] as const;

/** Shop profile setup, after the owner has an account (approved 6 Nov). One shop per owner. */
export async function createShop(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const owner = await currentOwner();
  if (!owner) redirect("/signup");
  const [already] = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.ownerId, owner.id));
  if (already) {
    await startSession(already.id);
    redirect("/today");
  }
  const raw = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = Form.safeParse(raw);
  if (!parsed.success) {
    const errors: OnboardingState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form") as Field;
      errors[key] ??= issue.message;
    }
    // Never send PINs back to the browser.
    const { pin: _p, pinConfirm: _c, ...values } = raw;
    return { errors, values };
  }
  const id = ulid();
  await db.insert(schema.shops).values({
    id,
    ownerId: owner.id,
    name: parsed.data.shopName,
    ownerName: parsed.data.ownerName,
    currency: parsed.data.currency,
    timezone: process.env.SHOP_TIMEZONE || "Africa/Lagos",
    openingCashKobo: parsed.data.openingCash,
    suiAddress: parsed.data.suiAddress,
    mode: "LIVE",
    pinHash: hashPin(parsed.data.pin),
  });
  await startSession(id);
  redirect("/today");
}

/** The demo shop holds only demo data, so it opens without a PIN. */
export async function openDemoShop(): Promise<void> {
  const [demo] = await db.select({ id: schema.shops.id }).from(schema.shops).where(eq(schema.shops.id, DEMO_SHOP_ID));
  if (!demo) redirect("/onboarding?demo=missing");
  await startSession(DEMO_SHOP_ID);
  redirect("/today");
}
