import { MemWal } from "@mysten-incubation/memwal";

// The only module in Trustbook that calls the Walrus Memory SDK (brief §3.1).

let client: MemWal | undefined;
function memwal(): MemWal {
  const key = process.env.MEMWAL_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) throw new Error("MEMWAL_PRIVATE_KEY and MEMWAL_ACCOUNT_ID must be set");
  return (client ??= MemWal.create({ key, accountId, serverUrl: process.env.MEMWAL_RELAYER_URL || "https://relayer.memory.walrus.xyz", namespace: "trustbook" }));
}

/** Starts a write and returns its job id straight away; the relayer finishes it in the background. */
export async function submitMemory(text: string, namespace: string, idempotencyKey: string): Promise<string> {
  const r = await memwal().remember(text, namespace, { idempotencyKey });
  return r.job_id;
}

export type JobState = { state: "pending" } | { state: "done"; blobId: string } | { state: "failed"; error: string };

/** A job counts as done only with a blob id (brief §1.3). */
export async function checkMemory(jobId: string): Promise<JobState> {
  const s = await memwal().getRememberStatus(jobId);
  if (s.status === "done" && s.blob_id) return { state: "done", blobId: s.blob_id };
  if (s.status === "failed" || s.status === "not_found") return { state: "failed", error: s.error ?? s.status };
  return { state: "pending" };
}

export interface Recalled {
  blobId: string;
  text: string;
  distance: number;
  namespace: string;
}

/** Semantic recall across several namespaces, merged and sorted by closeness. */
export async function recallMemories(query: string, namespaces: string[], limit = 10): Promise<Recalled[]> {
  const results = await Promise.all(
    namespaces.map(async (namespace) => {
      try {
        const r = await memwal().recall(query, { limit, namespace });
        return r.results.map((m) => ({ blobId: m.blob_id, text: m.text, distance: m.distance, namespace }));
      } catch {
        // An empty or missing month namespace should not break advice for the others.
        return [];
      }
    }),
  );
  return results.flat().sort((a, b) => a.distance - b.distance);
}

export async function relayerHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const h = await memwal().health();
    return { ok: true, detail: JSON.stringify(h).slice(0, 200) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
