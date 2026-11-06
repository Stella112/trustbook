import { formatNaira, formatUsdc } from "@trustbook/ledger";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { processOutbox } from "../../../../src/memory/outbox";
import { PayError, submitForQuote } from "../../../../src/pay/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = z.object({ quoteId: z.string().min(10).max(40), signature: z.string().min(10).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const { quote } = await submitForQuote(body.data.quoteId, body.data.signature);
    after(() => processOutbox().catch((err) => console.error("memory outbox:", err)));
    return NextResponse.json({ digest: quote.digest, naira: formatNaira(quote.amountKobo), usdc: formatUsdc(quote.usdcMicro), receiptUrl: `/p/receipt/${quote.id}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof PayError ? err.message : "The payment did not go through. Please try again." }, { status: 400 });
  }
}
