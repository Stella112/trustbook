import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyIndex } from "../../../../src/recovery/verify-source";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Query = z.object({ shop: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/) });

/** Public, read-only: the demo shop's sealed blob ids (from Walrus) and its anchor (through Tatum). */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await verifyIndex(parsed.data.shop));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message.slice(0, 200) : "failed" }, { status: 502 });
  }
}
