import { NextResponse } from "next/server";
import { z } from "zod";
import { payableTokens, PayError } from "../../../../src/pay/service";

export const dynamic = "force-dynamic";

/** Tokens in the customer's wallet that can be swapped to USDC for this payment. Read-only. */
export async function POST(request: Request) {
  const body = z.object({ quoteId: z.string().min(10).max(40), sender: z.string().min(3).max(80) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json({ tokens: await payableTokens(body.data.quoteId, body.data.sender) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PayError ? err.message : "Could not read your wallet's tokens." }, { status: 400 });
  }
}
