"use client";

import { createDAppKit, DAppKitProvider, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useEffect, useMemo, useState } from "react";

type Quote = { quoteId: string; naira: string; usdc: string; rate: string; expiresAt: string };
type Token = { coinType: string; symbol: string; decimals: number; balance: string };
type Step = "loading" | "ready" | "preparing" | "signing" | "confirming" | "done" | "error";

/** A raw token amount as text with up to 4 decimals, using integer maths only. */
function units(raw: string, decimals: number): string {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return `${(v / base).toLocaleString("en-NG")}${frac ? `.${frac}` : ""}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

export function PayFlow({ token }: { token: string }) {
  const dAppKit = useMemo(
    () =>
      createDAppKit({
        networks: ["mainnet"],
        // Reads go to our own read-only route, which forwards them to Tatum with the key kept on the server.
        createClient: () => new SuiGraphQLClient({ url: `${window.location.origin}/api/sui-graphql`, network: "mainnet" }),
      }),
    [],
  );
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <Flow token={token} />
    </DAppKitProvider>
  );
}

function Flow({ token }: { token: string }) {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ digest: string; receiptUrl: string } | null>(null);
  // Pay with USDC, or with another token swapped to USDC in the same payment (brief P1).
  const [tokens, setTokens] = useState<Token[]>([]);
  const [payWith, setPayWith] = useState<string>("USDC");
  const [estimate, setEstimate] = useState<{ coinType: string; text: string } | "loading" | "none" | null>(null);
  const chosen = tokens.find((t) => t.coinType === payWith) ?? null;

  useEffect(() => {
    setTokens([]);
    setPayWith("USDC");
    if (!quote || !account) return;
    post<{ tokens: Token[] }>("/api/pay/tokens", { quoteId: quote.quoteId, sender: account.address })
      .then((r) => setTokens(r.tokens))
      .catch(() => setTokens([]));
  }, [quote, account]);

  useEffect(() => {
    if (!quote || !chosen) return setEstimate(null);
    setEstimate("loading");
    post<{ amountIn: string }>("/api/pay/estimate", { quoteId: quote.quoteId, coinType: chosen.coinType })
      .then((r) => setEstimate({ coinType: chosen.coinType, text: `about ${units(r.amountIn, chosen.decimals)} ${chosen.symbol}` }))
      .catch(() => setEstimate("none"));
  }, [quote, chosen]);

  const getQuote = async () => {
    setStep("loading");
    setError("");
    try {
      setQuote(await post<Quote>("/api/pay/quote", { token }));
      setStep("ready");
    } catch (e) {
      setError((e as Error).message);
      setStep("error");
    }
  };
  useEffect(() => {
    void getQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = async () => {
    if (!quote || !account) return;
    setError("");
    try {
      setStep("preparing");
      const { bytes } = await post<{ bytes: string }>("/api/pay/build", { quoteId: quote.quoteId, sender: account.address, ...(chosen ? { coinType: chosen.coinType } : {}) });
      setStep("signing");
      const signed = await kit.signTransaction({ transaction: bytes });
      setStep("confirming");
      setReceipt(await post<{ digest: string; receiptUrl: string }>("/api/pay/submit", { quoteId: quote.quoteId, signature: signed.signature }));
      setStep("done");
    } catch (e) {
      setError((e as Error).message || "The payment was cancelled.");
      setStep("ready");
    }
  };

  if (step === "done" && receipt) {
    return (
      <div className="mt-6 rounded-xl border-2 border-emerald-700 bg-white p-4">
        <p className="text-xl font-bold text-emerald-800">Paid. Thank you!</p>
        <p className="mt-1">Verified on Sui.</p>
        <a href={receipt.receiptUrl} className="mt-3 block rounded-xl bg-emerald-700 px-4 py-3 text-center font-semibold text-white">
          See receipt
        </a>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      {quote && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-sm text-stone-600">You pay</div>
          <div className="text-2xl font-bold">{quote.usdc} USDC</div>
          <div className="text-sm text-stone-600">
            {quote.naira} at ₦{Number(quote.rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })} per USDC · price held until{" "}
            {new Date(quote.expiresAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}
      {step === "error" && (
        <button type="button" onClick={getQuote} className="w-full rounded-xl border border-stone-400 px-4 py-3 font-semibold">
          Try again
        </button>
      )}
      {quote && (
        <>
          <ConnectButton />
          {account && tokens.length > 0 && (
            <fieldset className="rounded-xl bg-white p-4 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-stone-700">Pay with</legend>
              <div className="grid gap-2">
                {[{ coinType: "USDC", symbol: "USDC" }, ...tokens].map((t) => (
                  <label key={t.coinType} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 ${payWith === t.coinType ? "border-emerald-700 bg-emerald-50" : "border-stone-200"}`}>
                    <input type="radio" name="payWith" checked={payWith === t.coinType} onChange={() => setPayWith(t.coinType)} disabled={step !== "ready"} className="h-5 w-5" />
                    <span className="font-semibold">{t.symbol}</span>
                  </label>
                ))}
              </div>
              {chosen && (
                <p className="mt-2 text-sm text-stone-700">
                  {estimate === "loading" ? "Checking the price…" : estimate === "none" ? `${chosen.symbol} cannot be swapped for this amount right now. Please choose USDC.` : estimate && estimate.coinType === chosen.coinType ? `You pay ${estimate.text}. It is swapped to exactly ${quote.usdc} USDC for the shop in the same payment; any extra comes back to you as USDC. Network fee paid by the shop.` : ""}
                </p>
              )}
            </fieldset>
          )}
          {account && (
            <button
              type="button"
              onClick={pay}
              disabled={step !== "ready" || (chosen !== null && (estimate === "none" || estimate === "loading"))}
              className="w-full rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60"
            >
              {step === "preparing" ? "Preparing…" : step === "signing" ? "Approve in your wallet…" : step === "confirming" ? "Confirming on Sui…" : chosen ? `Pay with ${chosen.symbol}` : `Pay ${quote.usdc} USDC`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
