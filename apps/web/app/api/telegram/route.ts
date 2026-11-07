import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { webhookSecret } from "../../../src/lib/telegram";
import { queueBrokenPromises, queueMemoriesForSaved } from "../../../src/memory/events";
import { processOutbox } from "../../../src/memory/outbox";
import { handleUpdate } from "../../../src/telegram/handle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram's webhook (approved 7 Nov). Only Telegram knows the secret it sends back in the
 * X-Telegram-Bot-Api-Secret-Token header, so anything else is refused before reading the body.
 */
export async function POST(request: Request) {
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(webhookSecret());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.text();
  if (body.length > 100_000) return NextResponse.json({ ok: true });
  let update: unknown;
  try {
    update = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    const done = await handleUpdate(update);
    if (done.saved) {
      const { shop, entries } = done.saved;
      after(async () => {
        try {
          await queueMemoriesForSaved(shop, entries);
          await queueBrokenPromises(shop);
          await processOutbox();
        } catch (err) {
          console.error("memory outbox:", err instanceof Error ? err.message : err);
        }
      });
    }
  } catch (err) {
    // Answer 200 anyway: Telegram would otherwise resend the same update again and again.
    console.error("telegram update failed:", err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true });
}
