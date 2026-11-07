import { createHmac } from "node:crypto";
import { appUrl } from "./paylink";

/**
 * Trustbook on Telegram (approved 7 Nov) through the Telegram Bot API. Verified against
 * https://core.telegram.org/bots/api on 7 Nov: setWebhook's secret_token is sent back in the
 * "X-Telegram-Bot-Api-Secret-Token" header (1–256 of A-Z a-z 0-9 _ -); getFile then
 * https://api.telegram.org/file/bot<token>/<file_path>; Update.message / Update.callback_query.
 * TODO(VERIFY): sendMessage / inline keyboard field names and the 64-byte callback_data limit came
 * from a summary of that page, not its exact text; confirmed by the first live run with a real bot.
 */
export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

/** The webhook secret, derived from APP_SECRET so there is no extra setting to manage. */
export function webhookSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set");
  return createHmac("sha256", s).update("telegram-webhook").digest("base64url").slice(0, 64);
}

export const webhookUrl = () => `${appUrl()}/api/telegram`;

export async function tg<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await r.json()) as { ok: boolean; result?: T; description?: string };
  if (!body.ok) throw new Error(`Telegram ${method} failed: ${body.description ?? r.status}`);
  return body.result as T;
}

export type Button = { text: string; data?: string; url?: string };

/** Telegram allows 4096 characters per message; Trustbook's messages are far shorter. */
export async function send(chatId: string | number, text: string, buttons?: Button[][]) {
  return tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } } : {}),
  });
}

export async function edit(chatId: string | number, messageId: number, text: string) {
  return tg("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000) });
}

export async function answerButton(callbackId: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** Points Telegram at this deployment, once; later calls see it is already set and do nothing. */
export async function ensureWebhook(): Promise<void> {
  const info = await tg<{ url: string }>("getWebhookInfo", {});
  if (info.url === webhookUrl()) return;
  await tg("setWebhook", { url: webhookUrl(), secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"] });
}

export async function botUsername(): Promise<string> {
  return (await tg<{ username: string }>("getMe", {})).username;
}

/** Downloads a voice note (Telegram keeps the file for at least an hour; bots may fetch up to 20 MB). */
export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram gave no file path");
  const r = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
  if (!r.ok) throw new Error(`voice download failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
