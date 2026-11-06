import { sealCheckpoint } from "./records";
import type { RecoveryInput } from "./verify";

/**
 * Deliberate damage for the "Try tampering" demo on /verify (brief §6.8a). Each works on a deep
 * COPY of what was read from Walrus, never on the real records, and matches one tamper test.
 */
export type TamperKind = "edit-entry" | "delete-middle-day" | "drop-newest-day" | "change-checkpoint-total";

export const TAMPERS: { kind: TamperKind; label: string; expectFail: string }[] = [
  { kind: "edit-entry", label: "Change one amount inside a sealed day", expectFail: "Fingerprints" },
  { kind: "delete-middle-day", label: "Delete a day in the middle", expectFail: "Chain" },
  { kind: "drop-newest-day", label: "Drop the newest day", expectFail: "Complete vs anchor" },
  { kind: "change-checkpoint-total", label: "Re-seal a month with a wrong total", expectFail: "Totals" },
];

const byDate = <T extends { record: { from: string } }>(a: T, b: T) => (a.record.from < b.record.from ? -1 : 1);

export function tamper(input: RecoveryInput, kind: TamperKind): { input: RecoveryInput; description: string } {
  const copy = structuredClone(input);
  const batches = [...copy.batches].sort(byDate);
  const days = batches.flatMap((b) => b.record.days.map((d) => ({ batch: b, day: d })));
  switch (kind) {
    case "edit-entry": {
      // A day near the middle with an amount to change.
      const target = days.slice(Math.floor(days.length / 2)).find(({ day }) => day.entries.some((e) => "totalKobo" in e || "amountKobo" in e));
      if (!target) throw new Error("no entry with an amount to change");
      const e = target.day.entries.find((x) => "totalKobo" in x || "amountKobo" in x)! as { totalKobo?: number; amountKobo?: number };
      if (e.totalKobo !== undefined) e.totalKobo += 100_000;
      else e.amountKobo! += 100_000;
      return { input: copy, description: `Added ₦1,000 to one entry on ${target.day.date}, without re-sealing.` };
    }
    case "delete-middle-day": {
      const target = days[Math.floor(days.length / 2)];
      if (!target || days.length < 3) throw new Error("not enough days to delete one in the middle");
      target.batch.record.days = target.batch.record.days.filter((d) => d !== target.day);
      return { input: copy, description: `Removed the record for ${target.day.date}.` };
    }
    case "drop-newest-day": {
      const last = batches.at(-1);
      const dropped = last?.record.days.pop();
      if (!dropped) throw new Error("no day to drop");
      if (!last!.record.days.length) copy.batches = copy.batches.filter((b) => b !== last);
      return { input: copy, description: `Removed the newest record, ${dropped.date}. The chain still looks whole.` };
    }
    case "change-checkpoint-total": {
      const cp = [...copy.checkpoints].sort((a, b) => (a.record.month < b.record.month ? -1 : 1)).at(-1);
      if (!cp) throw new Error("no monthly checkpoint to change");
      const { hash: _old, ...rest } = cp.record;
      rest.monthTotals = { ...rest.monthTotals, revenueKobo: rest.monthTotals.revenueKobo + 50_000 };
      cp.record = sealCheckpoint(rest);
      return { input: copy, description: `Raised ${cp.record.month}'s sealed sales by ₦500 and re-sealed it with a fresh fingerprint.` };
    }
  }
}
