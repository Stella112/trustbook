import { DEMO_SHOP_ID } from "../seed/demo";

/**
 * Shops whose books anyone may verify on /verify and /proof (approved 6 Nov: "public, names
 * hidden"). The demo shop is always public; a live shop is public only when its owner lists its id
 * in PUBLIC_SHOP_IDS (comma-separated), so no shop is exposed without its owner's choice.
 */
export function publicShopIds(): string[] {
  const listed = (process.env.PUBLIC_SHOP_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([DEMO_SHOP_ID, ...listed])];
}

export const isPublicShop = (shopId: string) => publicShopIds().includes(shopId);

/** "Mama Ngozi" → "M. N.": how a live shop's people are shown on public pages. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map((p) => `${p[0]!.toUpperCase()}.`).join(" ") : "?";
}
