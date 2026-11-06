import { NextResponse } from "next/server";
import { db, schema } from "../../../src/db/client";
import { sealShopExclusive } from "../../../src/recovery/seal";

export const dynamic = "force-dynamic";
// Vercel Hobby with fluid compute allows up to 300 s (docs/VERIFIED.md, Phase 6).
export const maxDuration = 300;

/**
 * End-of-day save (approved 6 Nov, Gate 5 decision 2). A daily Vercel Cron call seals every shop's
 * closed days, up to yesterday in the shop's timezone, and moves its Sui anchor. Only Vercel Cron,
 * which sends "Authorization: Bearer <CRON_SECRET>", may trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const deadline = Date.now() + 280_000;
  const shops = await db.select({ id: schema.shops.id }).from(schema.shops);
  const results: Record<string, unknown> = {};
  for (const shop of shops) {
    if (Date.now() > deadline - 60_000) {
      results[shop.id] = { skipped: true, reason: "out of time; the next run continues" };
      continue;
    }
    try {
      const r = await sealShopExclusive(shop.id, { deadline });
      results[shop.id] = r.skipped ? r : { sealedBatches: r.batches.length, checkpoints: r.checkpoints, dayCount: r.dayCount, stoppedEarly: r.stoppedEarly };
    } catch (err) {
      // One shop failing must not stop the others; the next run retries it.
      results[shop.id] = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
    }
  }
  return NextResponse.json({ results });
}
