# Gate 4 report — Payments (6 Nov 2026)

## Verdict: ready for approval
Customers can pay a debt in USDC from a Sui wallet with gas paid by the shop, verified through Tatum before it is recorded. Two real mainnet payments went through end to end. Cash and transfer payments are recorded with "Mark as paid", and the owner can send a WhatsApp reminder with a pay link. `pnpm test` passes 94 of 94.

## Verified test payments (mainnet)
| Test | Amount | Digest | Result |
|---|---|---|---|
| Service code (`scripts/test-sui-payment.ts`) | ₦100 = 0.074347 USDC at ₦1,345.06 | `B82pFPtZVPT2SfmHnhqdLoh22ktaVwcg9ZihR9Ld6aUz` | Digest matched the one the server built; Tatum showed the shop received exactly 74,347 micro-USDC |
| Pay page HTTP routes (`scripts/test-pay-routes.ts`) | ₦50 = 0.037181 USDC at ₦1,344.78 | `3L3DT9ALu9u52c3hk4A6WBqUnsambVoAWpZ68azh7MR1` | Verified, recorded, receipt shown |

In both, a second submit of the same payment was refused ("This payment is already complete"). The test customer was a temporary wallet funded from the sponsor; the shop's receiving address is the sponsor wallet, so the test USDC came back to it. Leftovers were returned.

**Resulting ledger and memory entries:** each payment added a `PAYMENT` entry for Tunde with `method: "sui"` and `verification: {digest, coinType, amountMinor, rateUsed}`, allocated oldest-first. Each wrote a `payment` behaviour memory, confirmed on Walrus. Tunde's balance went from ₦31,000 to ₦30,850.

## What was built
| Item | How it works |
|---|---|
| Pay link `/p/<token>` | HMAC-signed with `APP_SECRET`, expires in 7 days, encodes shop, customer, optional sale and amount. Never a lookup by phone number. |
| Rate | Tatum's USDC→NGN rate, kept as a decimal string; naira→USDC uses integer math and rounds up so the shop is never short-paid. Locked for 30 minutes. |
| Quote → build → submit | `/api/pay/quote` locks the rate; `/api/pay/build` builds the exact transfer (customer sends USDC, sponsor is gas owner) and stores its digest; `/api/pay/submit` checks the customer's signature, adds the sponsor's, executes through Tatum, and checks the digest matches. |
| Verification through Tatum | Transaction by digest: status SUCCESS and a USDC balance change crediting the shop with at least the quoted amount. Only then is the payment recorded. A unique index stops a digest being recorded twice. |
| Pay page | Shop, amount in naira and USDC, rate and expiry, Sui wallet connect (`@mysten/dapp-kit-react`), Pay, then receipt. |
| Receipt `/p/receipt/<id>` | Amount, USDC, rate, date, "Verified on Sui", digest and Suiscan link. |
| Customer page | "Send reminder on WhatsApp" (click-to-chat from the owner's phone), "Copy pay link", and "Mark as paid" (cash or transfer, merchant-confirmed). |
| `/proof` | Lists verified Sui payments with Suiscan links. |
| Read-only Tatum route | `/api/sui-graphql` lets the wallet library read through Tatum without the key reaching the browser; mutations are refused. |

## Not tested
- **Signing in a real browser wallet.** The browser pane has no Sui wallet extension, so the Connect Wallet button was checked but no wallet was connected. The same requests the page sends were tested live from a script. Please try one payment on your phone with a Sui wallet that holds a little USDC.
- **Mark as paid** was tested in the browser (Bisi, ₦5,000 cash).

## Decisions and limits
- **SUI payments cut**, as approved at Gate 1: USDC only.
- **The demo shop receives at the sponsor wallet** (`0xec26…f94e`), so demo payments recycle test USDC. A real shop sets its own address at onboarding.
- **Gas cost** is paid by the sponsor for every payment and for failed attempts. Someone could make the shop pay gas for payments they then fail to sign, but each costs a fraction of a cent and needs a valid pay link.
- **`APP_URL`** must be set to the public site address when deploying, so pay links in WhatsApp messages point to the live site rather than `localhost`.

## Sponsor wallet after testing
About 0.21 SUI and 0.27 USDC (test USDC returned).

## Next: Phase 5 (target 8–9 Nov)
Day records sealed to Walrus through the open key servers, weekly bundles, Sui anchor updates, `packages/recovery-core`, the `tools/recovery` command-line tool, the importer, `/verify` with the tamper demo, and the four tamper tests.
