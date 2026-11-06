import { formatNaira, formatUsdc } from "@trustbook/ledger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createQuote, PayError } from "../../../../src/pay/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = z.object({ token: z.string().min(10).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const q = await createQuote(body.data.token);
    return NextResponse.json({ quoteId: q.id, naira: formatNaira(q.amountKobo), usdc: formatUsdc(q.usdcMicro), rate: q.rate, expiresAt: q.expiresAt.toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PayError ? err.message : "Could not get a price. Please try again." }, { status: err instanceof PayError ? 400 : 502 });
  }
}
