import { NextResponse } from "next/server";
import { db, schema } from "../../../src/db/client";
import { queueBrokenPromises } from "../../../src/memory/events";
import { processOutbox } from "../../../src/memory/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The outbox worker, for a scheduled job. Vercel Cron sends "Authorization: Bearer <CRON_SECRET>";
 * anything else is refused, so the worker cannot be triggered by strangers.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const shops = await db.select().from(schema.shops);
  let broken = 0;
  for (const shop of shops) broken += await queueBrokenPromises(shop);
  const run = await processOutbox(45_000);
  return NextResponse.json({ brokenPromisesQueued: broken, ...run });
}
