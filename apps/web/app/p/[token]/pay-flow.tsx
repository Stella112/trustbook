"use client";

import { createDAppKit, DAppKitProvider, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useEffect, useMemo, useState } from "react";

type Quote = { quoteId: string; naira: string; usdc: string; rate: string; expiresAt: string };
type Step = "loading" | "ready" | "preparing" | "signing" | "confirming" | "done" | "error";

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
      const { bytes } = await post<{ bytes: string }>("/api/pay/build", { quoteId: quote.quoteId, sender: account.address });
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
          {account && (
            <button
              type="button"
              onClick={pay}
              disabled={step !== "ready"}
              className="w-full rounded-xl bg-emerald-700 px-4 py-4 text-lg font-semibold text-white disabled:opacity-60"
            >
              {step === "preparing" ? "Preparing…" : step === "signing" ? "Approve in your wallet…" : step === "confirming" ? "Confirming on Sui…" : `Pay ${quote.usdc} USDC`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
