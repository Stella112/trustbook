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

/**
 * USDC micro-units (6 decimals) needed to pay `kobo`, at `rate` naira per USDC given as a decimal
 * string ("1345.41476546"). Pure integer arithmetic; rounds up so the shop is never short-paid.
 */
export function koboToUsdcMicro(kobo: number, rate: string): number {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(rate.trim());
  if (!m || !(kobo > 0)) throw new Error(`bad rate or amount: ${rate}, ${kobo}`);
  const frac = m[2] ?? "";
  const scale = 10n ** BigInt(frac.length);
  const rateScaled = BigInt(m[1]!) * scale + BigInt(frac || "0");
  if (rateScaled === 0n) throw new Error("rate cannot be zero");
  // naira = kobo / 100; usdc = naira / rate; micro = usdc × 1e6  ⇒  kobo × 1e6 × scale / (100 × rateScaled)
  const num = BigInt(kobo) * 1_000_000n * scale;
  const den = 100n * rateScaled;
  const out = Number((num + den - 1n) / den);
  if (!Number.isSafeInteger(out)) throw new Error("amount too large");
  return out;
}

/** "0.074349" USDC from micro-units. */
export function formatUsdc(micro: number): string {
  return `${Math.floor(micro / 1_000_000)}.${String(micro % 1_000_000).padStart(6, "0")}`;
}

/** "₦150,000" or "₦2,500.50" from kobo. */
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const whole = Math.floor(abs / 100).toLocaleString("en-NG");
  const frac = abs % 100;
  return `${sign}₦${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}
