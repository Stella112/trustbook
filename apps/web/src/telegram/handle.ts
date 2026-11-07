import { createHash } from "node:crypto";
import { answer, buildDraft, parseNote, QuotaError, routeQuestion, transcribeVoiceNote, type Draft } from "@trustbook/agent";
import { formatNaira, instantAt, localTime, topDebtors, type Entry } from "@trustbook/ledger";
import { and, eq, gt } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { db, schema } from "../db/client";
import { bookForShop } from "../lib/book";
import { readDraft, signDraft } from "../lib/draft";
import { appUrl } from "../lib/paylink";
import { saveDraft } from "../lib/save-draft";
import { answerButton, downloadFile, edit, send } from "../lib/telegram";

type Shop = typeof schema.shops.$inferSelect;

/** The parts of a Telegram update Trustbook uses; everything else is ignored. */
const Update = z.object({
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      text: z.string().max(4096).optional(),
      voice: z.object({ file_id: z.string(), duration: z.number().optional(), mime_type: z.string().optional() }).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().max(64).optional(),
      message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});

export const hashLinkCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

const HELP = [
  "Send me what happened in your shop, the way you say it:",
  "• Tunde collect 2 crates egg, 9k, he go pay Friday",
  "• Mama Ngozi don pay 5k",
  "• I buy 10 crates egg 38k from Alhaji",
  "You can also send a voice note, or ask: “Who owe me pass?”",
  "",
  "/owes · who owes you most",
  "/help · this message",
].join("\n");

/** What to do after the reply: memories are queued once entries are saved (Walrus writes are slow). */
export interface Handled {
  saved?: { shop: Shop; entries: Entry[] };
}

export async function handleUpdate(raw: unknown): Promise<Handled> {
  const parsed = Update.safeParse(raw);
  if (!parsed.success) return {};
  const { message, callback_query: button } = parsed.data;
  if (button) return handleButton(button);
  if (!message) return {};
  const chatId = String(message.chat.id);
  const text = message.text?.trim() ?? "";

  // Linking: "/link CODE", or "/start CODE" from the one-tap link in Settings.
  const link = /^\/(?:link|start)\s+([A-Za-z0-9]{6,12})$/.exec(text);
  if (link) return linkChat(chatId, link[1]!);

  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.telegramChatId, chatId));
  if (!shop) {
    await send(chatId, "Welcome to Trustbook. To connect your shop, open Trustbook → Settings → Connect Telegram, then tap the link it gives you.", [[{ text: "Open Trustbook", url: `${appUrl()}/settings` }]]);
    return {};
  }
  if (text === "/start" || text === "/help") {
    await send(chatId, `Connected to ${shop.name}.\n\n${HELP}`);
    return {};
  }
  if (text === "/owes") return owes(shop, chatId);

  let note = text;
  let source: "text" | "voice" = "text";
  const book = await bookForShop(shop);
  if (message.voice) {
    try {
      const audio = await downloadFile(message.voice.file_id);
      // Telegram voice notes are Ogg/Opus, which Gemini reads as audio/ogg.
      note = await transcribeVoiceNote(audio, message.voice.mime_type ?? "audio/ogg", { customerNames: book.customers.map((c) => c.name), itemNames: book.items.map((i) => i.name) });
      source = "voice";
    } catch (err) {
      await send(chatId, err instanceof QuotaError ? err.message : "I could not hear that voice note. Please try again or type it.");
      return {};
    }
    if (!note) {
      await send(chatId, "I did not hear any words. Please try again.");
      return {};
    }
  }
  if (!note || note.startsWith("/")) {
    await send(chatId, HELP);
    return {};
  }
  note = note.slice(0, 300);

  let proposal: Awaited<ReturnType<typeof parseNote>>;
  try {
    proposal = await parseNote(note, { customerNames: book.customers.map((c) => c.name), itemNames: book.items.map((i) => i.name) });
  } catch (err) {
    await send(chatId, err instanceof QuotaError ? err.message : "Something went wrong reading that. Please try again.");
    return {};
  }

  if (proposal.kind === "ask_question") {
    try {
      const intent = await routeQuestion(proposal.question || note);
      const a = answer(intent, { entries: book.entries, settings: book.settings, today: book.today, debts: book.debts, customers: book.customers });
      await send(chatId, [a.text, ...a.facts.map((f) => `• ${f.label}: ${f.value}`), "", "Numbers come straight from your book."].join("\n"));
    } catch (err) {
      await send(chatId, err instanceof QuotaError ? err.message : "Something went wrong. Please try again.");
    }
    return {};
  }

  const now = instantAt(book.today, localTime(new Date().toISOString(), shop.timezone), shop.timezone);
  const draft: Draft = buildDraft(proposal, { shopId: shop.id, timezone: shop.timezone, now, customers: book.customers, items: book.items, debts: book.debts, newId: ulid, source });
  const heard = source === "voice" ? `You said: “${note}”\n\n` : "";
  const card = [`${heard}Check this:`, ...draft.lines.map((l) => `• ${l}`), ...draft.notes.map((n) => `  ${n}`)].join("\n");

  if (draft.questions.length || !(draft.entries.length || draft.newCustomers.length)) {
    await send(chatId, [card, "", "Please tell me:", ...draft.questions.map((q) => `• ${q}`), "", "Send it again with the details."].join("\n"));
    return {};
  }
  // Money received needs the owner's PIN, which a chat button cannot ask for safely: approve in the app.
  if (shop.pinHash && draft.entries.some((e) => e.type === "PAYMENT")) {
    await send(chatId, `${card}\n\nPayments need your PIN. Open Trustbook to approve this one.`, [[{ text: "Approve in Trustbook", url: `${appUrl()}/record?text=${encodeURIComponent(note)}` }]]);
    return {};
  }
  const id = ulid();
  await db.insert(schema.telegramCards).values({ id, shopId: shop.id, chatId, token: signDraft({ shopId: shop.id, entries: draft.entries, newCustomers: draft.newCustomers, newItems: draft.newItems }) });
  await send(chatId, `${card}\n\nNothing is saved until you tap Confirm.`, [[{ text: "✓ Confirm", data: `ok:${id}` }, { text: "✕ Cancel", data: `no:${id}` }]]);
  return {};
}

async function handleButton(b: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } }): Promise<Handled> {
  const m = /^(ok|no):([0-9A-Z]{26})$/.exec(b.data ?? "");
  if (!m || !b.message) {
    await answerButton(b.id);
    return {};
  }
  const chatId = String(b.message.chat.id);
  const [card] = await db.select().from(schema.telegramCards).where(and(eq(schema.telegramCards.id, m[2]!), eq(schema.telegramCards.chatId, chatId)));
  const [shop] = card ? await db.select().from(schema.shops).where(and(eq(schema.shops.id, card.shopId), eq(schema.shops.telegramChatId, chatId))) : [];
  if (!card || !shop) {
    await answerButton(b.id, "This card is no longer valid.");
    return {};
  }
  if (card.usedAt) {
    await answerButton(b.id, "Already done.");
    return {};
  }
  await db.update(schema.telegramCards).set({ usedAt: new Date() }).where(eq(schema.telegramCards.id, card.id));
  if (m[1] === "no") {
    await answerButton(b.id, "Cancelled");
    await edit(chatId, b.message.message_id, "Cancelled. Nothing was saved.");
    return {};
  }
  const draft = readDraft(card.token);
  if (!draft) {
    await answerButton(b.id, "This card expired.");
    await edit(chatId, b.message.message_id, "This card expired after 30 minutes. Please send the note again.");
    return {};
  }
  const saved = await saveDraft(shop, draft);
  await answerButton(b.id, "Saved");
  await edit(chatId, b.message.message_id, saved.already ? "Already saved." : `Saved to ${shop.name}. ✓`);
  return saved.already ? {} : { saved: { shop, entries: saved.entries } };
}

async function linkChat(chatId: string, code: string): Promise<Handled> {
  const [row] = await db
    .select()
    .from(schema.telegramLinkCodes)
    .where(and(eq(schema.telegramLinkCodes.codeHash, hashLinkCode(code)), gt(schema.telegramLinkCodes.expiresAt, new Date())));
  if (!row) {
    await send(chatId, "That code has expired or is not right. Open Trustbook → Settings → Connect Telegram for a new one.");
    return {};
  }
  await db.transaction(async (tx) => {
    // One chat per shop, one shop per chat: move the link if this chat was on another shop.
    await tx.update(schema.shops).set({ telegramChatId: null }).where(eq(schema.shops.telegramChatId, chatId));
    await tx.update(schema.shops).set({ telegramChatId: chatId }).where(eq(schema.shops.id, row.shopId));
    await tx.delete(schema.telegramLinkCodes).where(eq(schema.telegramLinkCodes.shopId, row.shopId));
  });
  const [shop] = await db.select({ name: schema.shops.name }).from(schema.shops).where(eq(schema.shops.id, row.shopId));
  await send(chatId, `Connected to ${shop?.name ?? "your shop"}. ✓\n\n${HELP}`);
  return {};
}

async function owes(shop: Shop, chatId: string): Promise<Handled> {
  const book = await bookForShop(shop);
  const top = topDebtors(book.debts, 10);
  await send(
    chatId,
    top.length
      ? ["Who owes you most:", ...top.map((d) => `• ${book.customerName(d.customerId)}: ${formatNaira(d.owedKobo)}${d.overdueKobo ? ` (${formatNaira(d.overdueKobo)} late)` : ""}`)].join("\n")
      : "Nobody owes you right now.",
  );
  return {};
}

