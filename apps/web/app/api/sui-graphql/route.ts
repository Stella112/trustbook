import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lets the customer's wallet library read Sui through Tatum without the Tatum key reaching the
 * browser. Read-only: mutations (such as executing transactions) and large bodies are refused.
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 8_000) return NextResponse.json({ errors: [{ message: "request too large" }] }, { status: 413 });
  let body: { query?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ errors: [{ message: "bad request" }] }, { status: 400 });
  }
  if (typeof body.query !== "string" || /\bmutation\b/i.test(body.query)) {
    return NextResponse.json({ errors: [{ message: "only read queries are allowed" }] }, { status: 403 });
  }
  const r = await fetch(process.env.TATUM_SUI_GRAPHQL_URL || "https://sui-mainnet.gateway.tatum.io/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.TATUM_API_KEY ?? "" },
    body: text,
  });
  return new NextResponse(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
