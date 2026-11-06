import { QuotaError, transcribeVoiceNote } from "@trustbook/agent";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "../../../src/db/client";
import { currentShop } from "../../../src/lib/shop";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// About a minute of compressed speech; anything larger is not a quick voice note.
const MAX_BYTES = 1_500_000;
// Browsers record "audio/webm;codecs=opus" (Chrome, Android) or "audio/mp4" (Safari, iPhone).
const Mime = z.string().regex(/^audio\/[a-z0-9.+-]+(;\s*codecs=[a-z0-9.,-]+)?$/i);

/** Owner-only: writes down a recorded voice note so it can go through the normal confirmation card. */
export async function POST(request: Request) {
  const shop = await currentShop();
  if (!shop) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const mime = Mime.safeParse(request.headers.get("content-type") ?? "");
  if (!mime.success) return NextResponse.json({ error: "send audio" }, { status: 415 });
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length === 0) return NextResponse.json({ error: "the recording was empty" }, { status: 400 });
  if (audio.length > MAX_BYTES) return NextResponse.json({ error: "keep voice notes under a minute" }, { status: 413 });
  try {
    // Gemini takes the base type; the codec parameter is not part of its MIME list.
    const [customers, items] = await Promise.all([
      db.select({ name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.shopId, shop.id)),
      db.select({ name: schema.items.name }).from(schema.items).where(eq(schema.items.shopId, shop.id)),
    ]);
    const text = await transcribeVoiceNote(audio, mime.data.split(";")[0]!.trim().toLowerCase(), { customerNames: customers.map((c) => c.name), itemNames: items.map((i) => i.name) });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof QuotaError ? err.message : "Could not read the voice note. Please try again or type it.";
    console.error("voice:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: err instanceof QuotaError ? 429 : 502 });
  }
}
