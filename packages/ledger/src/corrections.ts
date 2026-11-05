import type { CorrectionEntry, Entry, ReplaceableEntry } from "./types";

/**
 * The entries in effect after applying corrections. A correction reverses its target and may add a
 * replacement. A correction can itself be reversed by a later correction, which restores the target.
 * Nothing is edited in place: this only decides which recorded entries count.
 */
export function effectiveEntries(entries: readonly Entry[]): ReplaceableEntry[] {
  const byId = new Map<string, Entry>();
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`duplicate entry id ${e.id}`);
    byId.set(e.id, e);
    if (e.type === "CORRECTION" && e.replacement) {
      if (byId.has(e.replacement.id)) throw new Error(`duplicate entry id ${e.replacement.id}`);
      byId.set(e.replacement.id, e.replacement);
    }
  }
  const correctionsOf = new Map<string, CorrectionEntry[]>();
  for (const e of entries) {
    if (e.type !== "CORRECTION") continue;
    if (!byId.has(e.targetEntryId)) throw new Error(`correction ${e.id} targets unknown entry ${e.targetEntryId}`);
    if (e.targetEntryId === e.id) throw new Error(`correction ${e.id} targets itself`);
    const list = correctionsOf.get(e.targetEntryId) ?? [];
    list.push(e);
    correctionsOf.set(e.targetEntryId, list);
  }

  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  // An entry is reversed when any correction that targets it is itself still in effect.
  const reversed = (id: string): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error(`correction cycle at ${id}`);
    visiting.add(id);
    const result = (correctionsOf.get(id) ?? []).some((c) => !reversed(c.id));
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  const out: ReplaceableEntry[] = [];
  for (const e of entries) {
    if (e.type === "CORRECTION") {
      if (e.replacement && !reversed(e.id) && !reversed(e.replacement.id)) out.push(e.replacement);
    } else if (!reversed(e.id)) {
      out.push(e);
    }
  }
  return out;
}
