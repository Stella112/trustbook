import { NextResponse } from "next/server";
import { z } from "zod";
import { CoinType } from "../../../../src/pay/coin-type";
import { estimateSwap, PayError } from "../../../../src/pay/service";

export const dynamic = "force-dynamic";

/** About how much of a token this payment takes, from a live swap route. Read-only. */
export async function POST(request: Request) {
  const body = z.object({ quoteId: z.string().min(10).max(40), coinType: CoinType }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await estimateSwap(body.data.quoteId, body.data.coinType));
  } catch (err) {
    return NextResponse.json({ error: err instanceof PayError ? err.message : "That token cannot be swapped for this amount right now." }, { status: 400 });
  }
}
