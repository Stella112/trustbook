# Gate 1 report — Ledger core (6 Nov 2026)

## Verdict: ready for approval, with 6 questions
Phase 1 is built and runs end to end. `pnpm test` passes 46 of 46. The database is live on Supabase's free plan, the demo shop is seeded, and onboarding creates a real shop.

## What was built
| Item | Where | Status |
|---|---|---|
| Entry types, validation, corrections | `packages/ledger/src/types.ts`, `corrections.ts` | Done |
| Revenue, cash, cost of goods, profit, stock, cash on hand, net position | `accounting.ts` | Done |
| Debts, oldest-first allocation, overpayment credit, overdue, promises | `debts.ts` | Done |
| Trust labels with evidence and suggested limit | `trust.ts` | Done |
| Daily records and SHA-256 hash chain | `chain.ts` | Done |
| Exact naira parsing and formatting | `money.ts` | Done |
| Postgres schema and migrations (Drizzle) | `apps/web/src/db`, `apps/web/drizzle` | Applied to Supabase |
| Append-only rule | Database trigger refuses UPDATE, DELETE, TRUNCATE on entries | Tested |
| Row-level security | On for all tables, blocking Supabase's public REST API | Tested |
| Demo seed | `apps/web/scripts/seed-demo.ts`: 307 entries, 8 customers | Written; read back identical |
| Onboarding | `/onboarding`, plus "Open the demo shop" | Tested in the browser |

## Tests (46, all passing)
- **Money (4):** fractional quantities without float error; naira text such as "150,000", "₦2,500.5" and "9k" parsed exactly; bad amounts rejected; naira formatting.
- **Validation (5):** totals must match lines; credit sales need a customer; allocations cannot exceed the payment; no float money; at most 3 decimals of quantity.
- **Revenue and cash (2):** repayments are cash, never revenue; a repayment counts in the month it was paid.
- **Lagos month boundaries (2):** 23:30 UTC on 31 Oct counts as 1 Nov; 23:59 Lagos time on 31 Oct stays in October.
- **Cost and profit (3):** weighted average cost up to the sale date; "profit unavailable" with the item list when a cost is missing; later purchases never cost an earlier sale.
- **Debts (8):** partial payment; oldest-first; chosen debt first; overpayment kept as credit; proposed allocations; overdue after the promised date or 14 days; a new promise moves the due date; entries after the as-of date ignored.
- **Corrections (5):** reverse; replace; undo a correction; a payment re-applies when its sale is reversed; bad targets and duplicate ids rejected.
- **Position (2):** cash on hand, stock value, receivables and net position; warnings for stock with no cost or negative stock.
- **Trust labels (8):** New; not-yet-due debts excluded; Good payer; Careful by on-time rate, by 30+ days overdue, and by 2 broken promises; Sometimes late; owner override.
- **Hash chain (7):** deterministic canonical JSON; hash excludes itself; valid chain from GENESIS; an edited day is named; a deleted middle day is named; a dropped newest day is invisible to the chain alone (the Sui anchor catches it); a correction lands in the day it was recorded.

## Sample month summary (demo shop, October 2026, from a real run)
```
Sales ₦1,941,200 (170 sales) · cash collected ₦1,923,250 · stock bought ₦1,805,800 · expenses ₦28,000
Cost of goods ₦1,671,200 · gross profit ₦270,000 · net profit ₦242,000
At 31 Oct: cash ₦155,450 · stock ₦416,600 · owed to shop ₦75,450 (overdue ₦22,950)
           owed to supplier ₦50,000 · net position (estimate) ₦597,500
```
Customer labels as of 5 Nov:
```
Amaka    Good payer      Paid 8 of 8 on time
Bisi     Good payer      Paid 5 of 6 on time · usually 1 day late
Chinedu  Sometimes late  Paid 4 of 6 on time · usually 5 days late · limit ₦6,000
Sola     Sometimes late  Paid 3 of 5 on time · usually 2 days late · limit ₦2,000
Tunde    Careful         Paid 0 of 6 on time · usually 5 days late · 4 promises broken ·
                         oldest unpaid debt 35 days overdue · limit ₦5,400
Emeka    New             Paid 1 of 1 on time
Halima   Good payer      Paid 4 of 4 on time (holds ₦2,000 credit from an overpayment)
Uche     New             No credit due yet (cash customer)
```
Seed figures move with the run date, because the six weeks end the day before seeding.

## Questions for Maris
1. **Broken promises.** I count only explicit promises ("I go pay Friday") that are missed. The pay-by date set at sale time is the due date, already measured by the on-time rate. Counting it as a promise too would mark any customer who is late twice as Careful, contradicting Good payer. Confirm?
2. **New vs Careful.** The brief lists New first, so a customer with one debt 40 days overdue shows as New. I recommend checking Careful's hard rules (30+ days overdue, 2 broken promises) before New. Change it?
3. **Sui payments and cash on hand.** The brief's cash-on-hand formula counts every payment, but Sui payments land in the shop's Sui wallet, not the cash box. I recommend counting them separately as "In Sui wallet". Change it?
4. **Paying a supplier.** There is no entry for paying off a supplier balance, so "owed to supplier" can never go down. Adding a `SUPPLIER_PAYMENT` entry changes the data model. Add it?
5. **Customer credit.** Overpayments are kept as credit but not used up against the customer's next debt automatically. Halima shows ₦16,500 owed and ₦2,000 credit at the same time. Apply credit automatically?
6. **Owner login.** The brief does not ask for one, so anyone with the app link can open the owner screens. A simple PIN would take about an hour. Add it?

## Other things to know
- **Seeded entries** are recorded at their business time, so each lands in its own day's record. The shop is labelled Demo everywhere.
- **Deleting the database in the demo** must drop the tables or use a copy, because entries cannot be deleted one by one.
- **Weekly storage:** day records and their chain stay as the brief describes; Phase 5 stores a week's days in one Walrus record.
- The dev server runs on port 3100, because something else on this computer uses 3000.

## Schedule and proposed cuts
The hackathon closes **10 Nov, 17:00 UTC**; the brief targets shipping by **12:00 UTC** that day. Phase 1 was due 4 Nov, so the project is about two days behind, with four days left for Phases 2 to 7.

Proposed plan:
| Day | Work |
|---|---|
| 6 Nov | Phase 2: Today, This month and Customers screens; record by text with confirmation cards; Ask with a fixed set of questions |
| 7 Nov | Phase 3: behaviour memories, outbox, recall-backed advice, `/proof`, 10+ mainnet memories |
| 8 Nov | Phase 4: pay link, sponsored USDC payment verified by Tatum, WhatsApp reminders, mark as paid |
| 9 Nov | Phase 5: sealing, Sui anchor updates, recovery tool, `/verify` with tamper demo |
| 10 Nov AM | Deploy, README, blog, demo script |

Proposed cuts, all reversible later:
- **Daily records calendar** becomes a simple list of days.
- **Monthly logbook screen** reduced to the This month screen; the month-close checkpoint and lesson memory stay, because recovery needs them.
- **Ask** answers a fixed set of about six question types, including any date.
- **Payments:** USDC only, no SUI at a quoted rate.
- **All P1 items** (any-token swap, zkLogin, voice, QR, expiry display, CSV) cut.

Nothing in the demo script (Section 6.11) is cut.

## Approved 6 Nov
Maris approved Gate 1, all six recommendations and the proposed cuts. Applied:
- Hard warning signs mark even a new customer Careful.
- Sui payments count in a "Sui wallet" total, not cash on hand.
- New `SUPPLIER_PAYMENT` entry pays down supplier balances.
- Held customer credit is used against the next credit sale.
- Owner PIN: 6 digits, stored as a scrypt hash, sign-in by 8-character shop code, locked for 15 minutes after 5 wrong tries. The demo shop opens without a PIN. Tested in the browser.
- Broken promises count only explicit `PROMISE` entries (unchanged).
