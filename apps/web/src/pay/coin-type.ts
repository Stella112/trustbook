import { z } from "zod";

/** A Move coin type such as 0x2::sui::SUI or 0x…::usdc::USDC (no generics: plain fungible coins only). */
export const CoinType = z.string().max(300).regex(/^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/);
