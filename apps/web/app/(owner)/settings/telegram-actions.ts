"use server";

import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "../../../src/db/client";
import { currentShop } from "../../../src/lib/shop";
import { botUsername, ensureWebhook, telegramConfigured } from "../../../src/lib/telegram";
import { hashLinkCode } from "../../../src/telegram/handle";

export interface TelegramState {
  code?: string;
  username?: string;
  error?: string;
}

// No 0/O or 1/I, so the code is easy to read aloud and type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_MINUTES = 15;

/** Makes a one-time code that links the owner's Telegram chat to this shop. */
export async function connectTelegram(_prev: TelegramState): Promise<TelegramState> {
  const shop = await currentShop();
  if (!shop) return { error: "Please sign in again." };
  if (shop.mode !== "LIVE") return { error: "The demo shop cannot be linked to Telegram: anyone can open it. Create your own account first." };
  if (!telegramConfigured()) return { error: "Telegram is not set up on this site yet (TELEGRAM_BOT_TOKEN)." };
  try {
    await ensureWebhook();
    const username = await botUsername();
    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    await db.delete(schema.telegramLinkCodes).where(eq(schema.telegramLinkCodes.shopId, shop.id));
    await db.insert(schema.telegramLinkCodes).values({ codeHash: hashLinkCode(code), shopId: shop.id, expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) });
    return { code, username };
  } catch (err) {
    console.error("connect telegram:", err instanceof Error ? err.message : err);
    return { error: "Could not reach Telegram. Please try again." };
  }
}

export async function disconnectTelegram(): Promise<void> {
  const shop = await currentShop();
  if (!shop) return;
  await db.update(schema.shops).set({ telegramChatId: null }).where(eq(schema.shops.id, shop.id));
  revalidatePath("/settings");
}
