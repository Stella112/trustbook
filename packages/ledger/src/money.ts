/**
 * Parses a naira amount typed by a person ("150,000", "₦2,500.50", "9k") into kobo, using string
 * arithmetic only so no float ever touches money. Returns null when the text is not an amount.
 */
export function parseNairaToKobo(input: string): number | null {
  let s = input.trim().replace(/^₦|^NGN\s*/i, "").replace(/[,\s]/g, "");
  let multiplier = 1n;
  const suffix = s.slice(-1).toLowerCase();
  if (suffix === "k" || suffix === "m") {
    multiplier = suffix === "k" ? 1_000n : 1_000_000n;
    s = s.slice(0, -1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [, whole, frac = ""] = m;
  const kobo = (BigInt(whole!) * 100n + BigInt(frac.padEnd(2, "0"))) * multiplier;
  const out = Number(kobo);
  return Number.isSafeInteger(out) ? out : null;
}

/** "₦150,000" or "₦2,500.50" from kobo. */
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const whole = Math.floor(abs / 100).toLocaleString("en-NG");
  const frac = abs % 100;
  return `${sign}₦${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}
