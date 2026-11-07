"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { readDraft } from "../../../src/lib/draft";
import { PIN_MESSAGES, checkPin } from "../../../src/lib/pin";
import { saveDraft } from "../../../src/lib/save-draft";
import { currentShop } from "../../../src/lib/shop";
import { queueBrokenPromises, queueMemoriesForSaved } from "../../../src/memory/events";
import { processOutbox } from "../../../src/memory/outbox";

export interface ConfirmState {
  error?: string;
}

/**
 * Saves a confirmed card (shared save step in lib/save-draft). A card that records money received
 * needs the owner's PIN (approved 6 Nov); a wrong PIN leaves the card on screen.
 */
export async function confirmDraft(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const shop = await currentShop();
  if (!shop) redirect("/login");
  const draft = readDraft(String(formData.get("draft") ?? ""));
  if (!draft || draft.shopId !== shop.id) redirect("/record?error=expired");
  if (draft.entries.some((e) => e.type === "PAYMENT")) {
    const pin = await checkPin(shop, String(formData.get("pin") ?? ""));
    if (pin !== "ok" && pin !== "not-needed") return { error: PIN_MESSAGES[pin] };
  }
  let saved: Awaited<ReturnType<typeof saveDraft>>;
  try {
    saved = await saveDraft(shop, draft);
  } catch {
    redirect("/record?error=expired");
  }
  if (saved.already) redirect("/today?saved=already");
  // Memories are written after the owner's screen has moved on: a Walrus write takes 20–30 seconds.
  after(async () => {
    try {
      await queueMemoriesForSaved(shop, saved.entries);
      await queueBrokenPromises(shop);
      await processOutbox();
    } catch (err) {
      console.error("memory outbox:", err instanceof Error ? err.message : err);
    }
  });
  redirect("/today?saved=1");
}
