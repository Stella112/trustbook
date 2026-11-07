# Gate 7 report — Phase 6 extras and Phase 7 ship (6 Nov 2026)

## Verdict: ready to submit once deployed
Everything in the brief's P0 is built and checked on mainnet. Five of the six approved extras are built. README, blog draft and demo script are written. What remains needs Maris: deploy on Vercel, publish the blog, record the demo, and copy two IDs into the form.

## Phase 6 extras (approved 6 Nov)
| Extra | State | Evidence |
|---|---|---|
| End-of-day save | Built | `/api/seal`, daily Vercel cron, Postgres advisory lock, time budget. Tested by calling the handler: wrong secret 401, no-op run, skip while locked. |
| CSV export | Built | Month screen. 312 rows for 312 entries on the demo shop; Sui payments carry their digest. |
| QR codes | Built | Customer page: one for the whole balance, one per debt (that debt is paid first). No shop-wide QR: it would need a phone-number lookup, which the brief forbids. |
| Books secured until | Built | Month screen: "Books secured on Walrus until 4 June 2027 … 58 records stored", warning 30 days ahead. |
| Voice notes | Built | WebM/Opus and WAV transcribed word for word; iPhone (`audio/mp4`) untested. |
| Pay with any token | Built, simulated | Aftermath router on our Tatum client. Dry runs through Tatum: shop gets the exact USDC, sponsor pays gas, change returns to the customer. **A real executed swap payment has not run**; `apps/web/scripts/test-swap-payment.ts` is for Maris to run. |
| Sign in with Google | Not built | Mainnet zkLogin needs Enoki allowlisting (mainnet apps on paid plans) or a 16-core prover. Out of budget. |

Found and fixed along the way: the swap router dropped the "sponsor pays gas" setting (the customer would have paid gas); Gemini's free tier is 20 requests a day per model, so the app now falls back to other free models; one floating-point multiplication in the swap margin was replaced with integer maths.

## Definition of done (brief §9)
| Item | State |
|---|---|
| Walrus writes on mainnet, ≥ 10 confirmed memories with blob IDs on `/proof` | **Done**: 47 behaviour memories confirmed, plus 11 sealed ledger blobs |
| All Sui reads via Tatum; one real payment verified through Tatum | **Done**: 2 verified USDC payments (Gate 4) |
| Ledger tests pass; no floats in money code | **Done**: 107 tests pass; grep found one float in the swap margin, now integer |
| Look screens from real ledger data; Demo label visible | **Done** |
| Ask answers date questions from data | **Done** (Gate 2) |
| Labels and advice visibly change after new payment behaviour | **Ready, not yet recorded**: `scripts/demo-check.ts` shows Emeka going Insufficient history → Reliable payer (3 of 3 on time) after a ₦5,000 credit and full payment; must be done by 9 Nov |
| Recovery CLI: every step PASS without the app DB | **Done** (Gate 5) |
| Four tamper tests fail in the right step | **Done**, in tests and live on `/verify` |
| Rehearse-recovery shows identical advice | **Done**: all 8 customers identical |
| `/verify` runs in the browser; tamper toggle fails | **Done** |
| WhatsApp reminder link with pay link | **Done** (Gate 4); pay links need `APP_URL` set on Vercel |
| No secrets in repo or client bundle | **Done**: checked the build output and the whole git history for every secret value in `.env` |
| README, VERIFIED, BLOG, DEMO complete and honest | **Done** (blog and README need the live link added) |
| Public repo; deployed URL works on a phone | Repo **done**: https://github.com/Stella112/trustbook. **Deploy pending** |

## Submission fields
| Field | Value |
|---|---|
| Project | Trustbook |
| Track | 03 — Consumer Finance Apps (also Best Walrus Memory) |
| Public repo | https://github.com/Stella112/trustbook |
| Live demo | https://trustbook-app.vercel.app |
| Blog post | `docs/BLOG.md`, to publish (Medium, Mirror, dev.to or similar) |
| `MEMWAL_AGENT_ID` (delegate public key) | `c0ab165c5abecc7e015971cd3428c8b12c613593998a4ed2a06edc98267d7c0f` (checked: it matches the key the app writes with) |
| Tatum dashboard account ID | Maris to copy from dashboard.tatum.io (not stored in the project) |
| Mainnet memories | 47 confirmed, listed on `/proof` |

## Maris's to-do before 10 Nov, 17:00 UTC
1. Deploy on Vercel (Root Directory `apps/web`; variables from `.env.example`, including `CRON_SECRET`, `APP_URL`, `GEMINI_FALLBACK_MODELS`), then send me the address to check on a phone.
2. Optional: run `npx tsx scripts/test-swap-payment.ts .spike/swap-customer.key 100` from `apps/web` (moves real funds: about 0.1 SUI, mostly returned).
3. Record the demo (`docs/DEMO.md`) on 7–9 Nov.
4. Publish the blog with the live link, then fill in the form.
