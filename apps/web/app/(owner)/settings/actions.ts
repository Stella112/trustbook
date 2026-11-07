"use server";

import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "../../../src/db/client";
import { checkPin, PIN_MESSAGES } from "../../../src/lib/pin";
import { currentShop } from "../../../src/lib/shop";

export interface AddressState {
  error?: string;
  saved?: string;
}

const Address = z
  .string()
  .trim()
  .refine((s) => /^0x[0-9a-fA-F]{64}$/.test(s) && isValidSuiAddress(s), "A Sui address starts with 0x and has 64 letters and numbers after it")
  .transform((s) => normalizeSuiAddress(s));

/**
 * Sets where customers' Sui payments go. It decides where money lands, so the owner's PIN approves
 * it (approved 6 Nov). The demo shop's address cannot be changed: anyone can open the demo shop.
 */
export async function updateSuiAddress(_prev: AddressState, formData: FormData): Promise<AddressState> {
  const shop = await currentShop();
  if (!shop) return { error: "Please sign in again." };
  if (shop.mode !== "LIVE") return { error: "The demo shop's receiving address cannot be changed." };
  const parsed = Address.safeParse(String(formData.get("suiAddress") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const pin = await checkPin(shop, String(formData.get("pin") ?? ""));
  if (pin !== "ok") return { error: pin === "not-needed" ? "Set up your PIN first." : PIN_MESSAGES[pin] };
  await db.update(schema.shops).set({ suiAddress: parsed.data }).where(eq(schema.shops.id, shop.id));
  revalidatePath("/settings");
  return { saved: parsed.data };
}
