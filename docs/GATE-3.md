# Gate 3 report — Memory loop, outbox, proof (6 Nov 2026)

## Verdict: ready for approval
Behaviour memories are written to Walrus Memory on mainnet through an outbox, recalled as evidence in credit advice, and listed on `/proof`. **44 memories are confirmed on mainnet with blob IDs, 0 failed.** `pnpm test` passes 93 of 93 (ledger 63, agent 22, memory 8).

## What was built
| Item | How it works |
|---|---|
| `packages/memory` | The only module that calls the Walrus Memory SDK: submit, check job, recall across namespaces, relayer health. Pure event rules decide what to remember. |
| Memory events (brief §6.3) | Credit given; payment with days early or late; promise made, kept, broken; trust label changed; month closed. Each is compact JSON with `occurredAt` and a one-line `summary`, in `trustbook:<shop>:behaviour:<YYYY-MM>`. Demo-shop memories carry `"demo": true`. |
| Outbox (brief §6.6) | Table `outbox`: pending → submitted → confirmed or failed. Writes use idempotency keys, retries back off up to 8 attempts, and a dedupe key stops the same event being written twice. A memory counts only once a blob ID returns. |
| Worker | Runs straight after a confirmed entry (Next `after()`), from `scripts/outbox-run.ts`, and from `/api/outbox` for a scheduled job (needs `CRON_SECRET`). Also queues broken promises once their date passes. |
| Credit advice | On each customer page, and on the confirmation card whenever an existing customer takes credit. Label, numbers and limit come from the ledger; up to 3 recalled Walrus memories are quoted as evidence, warning signs first. |
| Month close (brief §6.7) | Past months show their lesson, worded from computed numbers. Opening a new month closes the last one automatically; older months have a Close button. |
| `/proof` (public) | Live relayer status, latest Sui checkpoint through Tatum, Sui anchor read through Tatum, count of confirmed memories (demo vs live), and every confirmed blob ID with its summary. |
| `packages/chain` | The only module that calls Tatum: latest checkpoint and anchor read. |

## Confirmed memories on mainnet
| Kind | Count |
|---|---|
| credit | 20 |
| payment | 18 |
| promise_broken | 4 |
| promise_made | 1 |
| month_lesson | 1 |
| **Total** | **44** |

39 came from the demo seed (`scripts/seed-memories.ts`, facts from the seeded history). 5 came from real app actions today: Tunde's payment, October's lesson, and 3 broken promises found by the worker. All belong to the demo shop, so all are labelled demo.

## Before and after
Tunde, before and after recording "Tunde don pay 41,250" in the app:

| | Before | After |
|---|---|---|
| Owes | ₦72,250, ₦41,250 overdue | ₦31,000, nothing overdue |
| Advice | Be careful giving more credit | Be careful giving more credit |
| Top memory recalled | "Tunde paid ₦5,400, 4 days after the promised date." | "Tunde paid ₦41,250, 36 days after the promised date." (written minutes earlier) |

Screenshots: [advice-before.jpg](gate-3/advice-before.jpg), [advice-after.jpg](gate-3/advice-after.jpg), [month-lesson.jpg](gate-3/month-lesson.jpg).

The label stays Careful because of 4 broken promises in 60 days. This is the rule working, not a fault.

## Not built yet (small)
- **Owner label override** (brief §6.2): the database column exists; the button and its memory are not built.
- **Today tip from last month's lesson** (brief §6.7).
- **90-memories-a-month fallback** (brief §6.8b): current months hold 15–24 memories, far under the cap.

## Things to know
- **Seeded label changes were left out.** Replaying history only on entry days misses changes caused by time passing and would tell a wrong story. Label-change memories come from real app actions only.
- **Writes take 20–30 seconds** to confirm; the owner's screen never waits for them.
- **The demo shop now holds two real recorded entries** (Tunde's ₦9,000 credit and ₦41,250 payment) and the October lesson.
- **Scheduled worker on Vercel** needs a `CRON_SECRET` set at deploy time.

## Next: Phase 4 (target 7–8 Nov)
Signed pay links, wallet connect, sponsored USDC payment verified through Tatum, allocation, receipt, WhatsApp reminder, and mark-as-paid.
