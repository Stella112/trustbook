"use client";

import { formatNaira } from "@trustbook/ledger";
import { tamper, TAMPERS, verifyRecovery, type BatchRecord, type CheckpointRecord, type RecoveryInput, type RecoveryResult, type Sealed, type StepStatus, type TamperKind } from "@trustbook/recovery-core";
import { useMemo, useState } from "react";

interface Index {
  shopId: string;
  shopName: string;
  anchorId: string;
  anchor: RecoveryInput["anchor"];
  anchorError?: string;
  blobs: { blobId: string; namespace: string }[];
}

const AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space/v1/blobs/";
const SUISCAN = "https://suiscan.xyz/mainnet";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `request failed (${r.status})`);
  return body;
}

/**
 * Runs the recovery proof in the browser (brief §6.8a /verify): the same checks as the
 * command-line tool, from @trustbook/recovery-core, on records fetched from Walrus.
 */
export function Verifier({ shopId }: { shopId: string }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [index, setIndex] = useState<Index | null>(null);
  const [input, setInput] = useState<RecoveryInput | null>(null);
  const [tamperKind, setTamperKind] = useState<TamperKind | "">("");

  async function run() {
    setPhase("loading");
    setError("");
    setTamperKind("");
    try {
      const idx = await getJson<Index>(`/api/verify/index?shop=${encodeURIComponent(shopId)}`);
      setIndex(idx);
      setProgress({ done: 0, total: idx.blobs.length });
      const got = await getJson<{ records: { blobId: string; sealed: Sealed }[]; problems: string[] }>(`/api/verify/records?shop=${encodeURIComponent(shopId)}`);
      const batches: RecoveryInput["batches"] = [];
      const checkpoints: RecoveryInput["checkpoints"] = [];
      for (const r of got.records) {
        if (r.sealed.kind === "batch") batches.push({ record: r.sealed.record as BatchRecord, blobId: r.blobId });
        else checkpoints.push({ record: r.sealed.record as CheckpointRecord, blobId: r.blobId });
      }
      setProgress({ done: got.records.length, total: idx.blobs.length });
      const problems = [...got.problems];
      if (idx.anchorError) problems.push(idx.anchorError);
      setInput({ shopId, batches, checkpoints, anchor: idx.anchor, anchorError: idx.anchorError, behaviourFound: null, discoveryProblems: problems });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  const view = useMemo(() => {
    if (!input) return null;
    if (!tamperKind) return { result: verifyRecovery(input), description: "" };
    try {
      const t = tamper(input, tamperKind);
      return { result: verifyRecovery(t.input), description: t.description };
    } catch (err) {
      return { result: verifyRecovery(input), description: `Could not tamper: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [input, tamperKind]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={run}
        disabled={phase === "loading"}
        className="w-full rounded-xl bg-emerald-700 px-5 py-4 text-lg font-semibold text-white shadow-sm disabled:opacity-60 sm:w-auto"
      >
        {phase === "loading" ? (progress.total ? `Reading ${progress.total} records from Walrus…` : "Finding records and reading the Sui anchor…") :phase === "done" ? "Verify again" : "Verify these books"}
      </button>
      {phase === "error" && <p className="mt-3 text-red-700">Could not run the check: {error}</p>}

      {view && index && (
        <>
          <section className={`mt-6 rounded-xl border-2 p-4 ${view.result.ok ? "border-emerald-600 bg-emerald-50" : "border-red-600 bg-red-50"}`}>
            <div className="text-sm font-semibold uppercase tracking-wide text-stone-600">{tamperKind ? "Tampered copy (in this browser only)" : "Records as stored on Walrus"}</div>
            <div className={`mt-1 text-2xl font-bold ${view.result.ok ? "text-emerald-800" : "text-red-800"}`}>
              {view.result.ok ? (view.result.steps.some((s) => s.status === "SKIPPED") ? "No failures. Books complete and unchanged." : "Books complete and unchanged.") : "Problems found."}
            </div>
            {view.description && <p className="mt-1 text-stone-800">{view.description}</p>}
          </section>

          <ol className="mt-4 divide-y divide-stone-200 rounded-xl bg-white shadow-sm">
            {view.result.steps.map((s, i) => (
              <li key={s.name} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {i + 1}. {s.name}
                    </div>
                    <div className="text-sm text-stone-700">{s.name === "Behaviour memory" && s.status === "SKIPPED" ? "Checked by the recovery tool, which holds the Walrus key; not run in the browser." : s.detail}</div>
                  </div>
                  <Badge status={s.status} />
                </div>
                {s.status !== "PASS" && s.problems.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
                    {s.problems.slice(0, 6).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          <section className="mt-6 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Try tampering</h2>
            <p className="text-sm text-stone-700">Damage a copy of the records in this browser and watch the same checks catch it. The real records on Walrus are never touched.</p>
            <div className="mt-3 grid gap-2">
              <TamperOption checked={tamperKind === ""} onChange={() => setTamperKind("")} label="No tampering" />
              {TAMPERS.map((t) => (
                <TamperOption key={t.kind} checked={tamperKind === t.kind} onChange={() => setTamperKind(t.kind)} label={t.label} hint={`should fail: ${t.expectFail}`} />
              ))}
            </div>
          </section>

          <Evidence index={index} result={view.result} input={input!} />
        </>
      )}
    </div>
  );
}

function Badge({ status }: { status: StepStatus }) {
  const tone = status === "PASS" ? "bg-emerald-100 text-emerald-900" : status === "FAIL" ? "bg-red-100 text-red-900" : "bg-stone-200 text-stone-800";
  return <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold ${tone}`}>{status}</span>;
}

function TamperOption({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${checked ? "border-stone-900 bg-stone-100" : "border-stone-200"}`}>
      <input type="radio" name="tamper" checked={checked} onChange={onChange} className="h-5 w-5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

function Evidence({ index, result, input }: { index: Index; result: RecoveryResult; input: RecoveryInput }) {
  const blobs = [
    ...input.batches.map((b) => ({ blobId: b.blobId, label: `Days ${b.record.from} to ${b.record.to}`, sortKey: b.record.from })),
    ...input.checkpoints.map((c) => ({ blobId: c.blobId, label: `Month checkpoint ${c.record.month}`, sortKey: `${c.record.month}-99` })),
  ].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Check it yourself</h2>
      <p className="mt-1 break-all text-sm">
        Sui anchor{" "}
        <a className="underline" href={`${SUISCAN}/object/${index.anchorId}`} target="_blank" rel="noopener noreferrer">
          {index.anchorId}
        </a>
        {index.anchor?.lastTxDigest && (
          <>
            {" "}
            · last update{" "}
            <a className="underline" href={`${SUISCAN}/tx/${index.anchor.lastTxDigest}`} target="_blank" rel="noopener noreferrer">
              {index.anchor.lastTxDigest}
            </a>
          </>
        )}
      </p>
      <ul className="mt-3 divide-y divide-stone-200 rounded-xl bg-white text-sm shadow-sm">
        {blobs.map((b) => (
          <li key={b.blobId} className="px-4 py-2">
            <div className="font-semibold">{b.label}</div>
            <a className="break-all font-mono text-xs underline" href={`${AGGREGATOR}${b.blobId}`} target="_blank" rel="noopener noreferrer">
              {b.blobId}
            </a>
            <span className="text-xs text-stone-500"> (encrypted, as stored on Walrus)</span>
          </li>
        ))}
      </ul>
      {result.balances.length > 0 && (
        <>
          <h3 className="mt-4 font-semibold">Who owes what, rebuilt from these records</h3>
          <ul className="mt-1 text-sm">
            {result.balances.map((b) => (
              <li key={b.customerId} className="flex justify-between border-b border-stone-200 py-1">
                <span>{b.name}</span>
                <span className="font-mono">{formatNaira(b.owedKobo)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
