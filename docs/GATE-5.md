# Gate 5 report — Provable Recovery (6 Nov 2026)

## Verdict: approved by Maris on 6 Nov 2026 (decision 1 accepted as written; decision 2 still open)
The demo shop's books are sealed to Walrus mainnet and anchored on Sui. The standalone recovery tool rebuilds them with no access to the app database and passes every step. A full wipe rehearsal gives identical advice, numbers and cited memories before and after. `/verify` runs the same proof in the browser, and each of the four tamper options fails the step it should. `pnpm test` passes 105 of 105.

## Real recovery report (`tools/recovery`, run 2026-11-06 12:29 UTC)
```
TRUSTBOOK RECOVERY REPORT — Mama Ngozi Provisions — run 2026-11-06T12:29:58.505Z
Records found ....... 42 day records in 9 Walrus blobs, 2 monthly checkpoints PASS
Anchor (Sui) ........ last day 2026-11-05, 42 days, tx 98tq4P7h1C7MmvisEdf2PS6RbLC66VCujPe2kQyThNd7 PASS
Fingerprints ........ 42/42 day records match, 2/2 checkpoints match     PASS
Chain ............... unbroken GENESIS → 2026-11-05                      PASS
Complete vs anchor .. 42 = 42, head hash matches                         PASS
Totals .............. 2026-09, 2026-10 match sealed checkpoints (0 kobo diff) PASS
Balances ............ 6 customers, ₦73,450 owed at 2026-10 close, all match PASS
Behaviour memory .... 47/47 memories restored                            PASS
RESULT: BOOKS COMPLETE AND UNCHANGED
```
The tool removes `DATABASE_URL` from its own environment before it starts and does not import from `apps/web`. It needs only the Walrus delegate key, the account ID, a Tatum key, the shop ID and the anchor ID.

Command:
```
cd tools/recovery
npx tsx src/cli.ts --shop demo-mama-ngozi --anchor 0x1f93f1635a8b000045f4ce3ea16369022fb58320f793c7702ef022ca4a2134e9 --env ../../.env --out ./recovered
```

## Tamper tests (automated, `packages/recovery-core`)
```
✓ TAMPER 1: an edited entry fails fingerprints, naming the day
✓ TAMPER 2: a deleted middle day fails the chain, naming the gap
✓ TAMPER 3: a deleted newest day fails completeness against the anchor
✓ TAMPER 4: a changed amount that no longer reconciles fails totals with the kobo difference
✓ tampering demo (/verify): each tamper fails exactly the step it is meant to, on a copy
```

## Live tampering on real Walrus data (`/verify`, in the browser)
The checks ran on the 42 real day records read from Walrus, each time on an in-memory copy:

| Tamper | What failed |
|---|---|
| Add ₦1,000 to one entry on 2026-10-16, without re-sealing | Fingerprints: "day 2026-10-16 was changed" (Totals and Balances also fail) |
| Remove the record for 2026-10-16 | Chain: "missing day record(s) after 2026-10-15 and before 2026-10-17"; Complete vs anchor: 41 of 42 |
| Remove the newest record, 2026-11-05 | Only Complete vs anchor: "Anchor says 42 days up to 2026-11-05; found 41 up to 2026-11-04." The chain alone looks whole. |
| Raise October's sealed sales by ₦500 and re-seal it | Only Totals: "2026-10 revenueKobo … (difference -50000 kobo)" |

Switching back to "No tampering" passes again. The page works at phone width.

## Learning survives the wipe (`apps/web/scripts/rehearse-recovery.ts`)
One command: record every customer's advice and the month totals from the real database, recover from Walrus and the Sui anchor with `tools/recovery`, import into a fresh empty database (`trustbook_rehearsal`, a separate free database in the same Supabase project, so the real one is never touched), then ask again. It exits non-zero on any difference. Run 2026-11-06, after the batch reader and relayer retries landed:

```
               BEFORE (real database)                                     | AFTER (wiped, recovered from Walrus)
Customer       Tunde                                                      | Tunde
Label          Careful                                                    | Careful
Advice         Be careful giving more credit.                             | Be careful giving more credit.
Evidence       Paid 0 of 6 on time · usually 5 days late · 4 promises bro | Paid 0 of 6 on time · usually 5 days late · 4 promises bro
Owes           ₦63,250 (₦41,250 overdue)                                  | ₦63,250 (₦41,250 overdue)
Limit          ₦5,400                                                     | ₦5,400
Remembered     "Tunde broke the promise to pay by 2026-10-11." (blob JQFB | "Tunde broke the promise to pay by 2026-10-11." (blob JQFB
               "Tunde broke the promise to pay by 2026-10-17." (blob uIgK | "Tunde broke the promise to pay by 2026-10-17." (blob uIgK
               "Tunde paid ₦5,400, 4 days after the promised date." (blob | "Tunde paid ₦5,400, 4 days after the promised date." (blob

All customers:
  Amaka      Good payer      ₦6,000     → Good payer      ₦6,000     same
  Bisi       Good payer      ₦44,000    → Good payer      ₦44,000    same
  Chinedu    Sometimes late  ₦12,000    → Sometimes late  ₦12,000    same
  Emeka      New             ₦24,750    → New             ₦24,750    same
  Halima     Good payer      ₦14,500    → Good payer      ₦14,500    same
  Sola       Sometimes late  ₦12,150    → Sometimes late  ₦12,150    same
  Tunde      Careful         ₦63,250    → Careful         ₦63,250    same
  Uche       New             ₦0         → New             ₦0         same

Months compared: 2026-09, 2026-10, 2026-11 — all totals identical
Entries compared: 307. Entries recorded after 2026-11-05 (not sealed yet, so not on Walrus): 5.

RESULT: IDENTICAL — the advice, the numbers and the cited memories survived the wipe.
```

Both sides are compared as of the last sealed day, 5 Nov; see decision 2. Advice ignores memories dated after the day it is computed for, so quotes never run ahead of the numbers.

## What was built
| Item | How it works |
|---|---|
| Sealing (`apps/web/src/recovery/seal.ts`) | Closed days, up to yesterday, sealed in weekly batches that never cross a month, encrypted to the open Seal servers. The anchor moves only after Walrus confirms each batch. A month with every day sealed gets a checkpoint with totals, balances and behaviour memory counts. |
| Anchor (`packages/chain/src/anchor.ts`) | Creates the shop's anchor, updates it, and finds its cap through Tatum after a wipe. |
| `tools/recovery` | Lists the shop's ledger blobs, reads them from a public aggregator with one Seal key request, reads the anchor through Tatum, restores behaviour memory, runs `recovery-core`, and writes `report.md`, `ledger.json` and `memories.json`. `--blobs <file>` reads a list of blob IDs instead of asking the relayer for it. |
| Importer (`apps/web/scripts/import-recovery.ts`) | Fills an **empty** database only. Entries go back byte-identical, so their hashes still match and sealing continues the same chain. The seal history and anchor cap are restored. All 47 memories return to the outbox as confirmed with their real blob IDs; 42 get their original dedupe keys back, so the app never writes them twice. |
| `/verify` | Public. The server hands over the sealed records (phone numbers removed, demo shop only) and the anchor read through Tatum; the browser runs the checks. Links go to Suiscan and to the encrypted blobs on the Walrus aggregator. |
| `/proof` | Now shows the shop's real anchor instead of the Phase 0 test anchor, plus every sealed blob and its anchor update. |

## Costs
- Sponsor wallet after sealing 42 days (1 anchor creation, 8 updates): about 0.217 SUI, the same as after Gate 4. Each update costs a fraction of a cent.
- Walrus storage for the 11 blobs was paid by the hosted relayer. No WAL was spent.

## Decisions for Maris
1. **Entries keep their original `source` after import.** The brief says imported entries get `source: "recovery"`. Changing it would change every entry's hash, so the restored books would no longer match Walrus and sealing could not continue the chain. I kept entries exactly as sealed. The recovery shows in the report and import log, not on each entry. Is that acceptable?
2. **Today is never sealed.** Sealing stops at yesterday, because a day sealed in the morning could not take the afternoon's entries without breaking the chain. Today's entries live only in the database until the next seal. For the live demo, the wipe should happen after that day's seal, or we accept that the demo day's own entries are lost and say so on screen. Today's 5 test entries (6 Nov) are a real example: their memories are on Walrus, but the entries are not yet. Options: keep it as is, or add an end-of-day seal job (a Vercel cron, free).

## Not tested or not proven
- **Rebuilding a wiped relayer index.** `restore` found all 47 behaviour memories, but the relayer already had them indexed. We cannot wipe the hosted relayer's index to test a cold rebuild.
- **`/verify` on Vercel.** Tested on the local dev server: the first run takes about a minute (Tatum anchor read plus 11 Walrus reads); later runs are cached. Vercel's free tier allows 60 seconds per request, so it must be checked after deploy.
- **Walrus expiry.** The relayer-paid storage expires (about 7 months for earlier test blobs). Renewal needs the account owner wallet and WAL; still roadmap.
- **Discovery** of ledger blobs uses the relayer's listing. On 6 Nov one rehearsal run failed because the relayer timed out (HTTP 504 on its 5-second preflight). Listing now retries with backoff. If the relayer is still down, the tool reports a clear FAIL and accepts `--blobs <file>` with the blob IDs that `/proof` lists. The `--blobs` path has not yet been run end to end.

## Next: Phase 6 (9 Nov)
P1 items only as you approve them, then polish. Phase 7 (deploy, README, blog, demo script) is due by 10 Nov 12:00 UTC.
