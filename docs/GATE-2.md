# Gate 2 report — Look, Record, Ask (6 Nov 2026)

## Verdict: ready for approval, with 2 decisions
Phase 2 works end to end on the demo shop, tested in the browser at phone size. `pnpm test` passes 85 of 85 (ledger 63, agent 22).

## What was built
| Screen | What it shows | Screenshot |
|---|---|---|
| Today | Sales, credit given, money collected, spending, promises due today, a record box, and today's entries | [today.jpg](gate-2/today.jpg) |
| Month | Sales, profit (or why it is unavailable), money on credit, net position, and a list of days, with earlier/later months | — |
| Day | One day's totals and every entry | — |
| Customers | Ranked by what they owe, each with label and evidence; detail page with unpaid debts and history | [customers.jpg](gate-2/customers.jpg) |
| Record | Note → Gemini → confirmation card → Confirm saves | [record-card.jpg](gate-2/record-card.jpg) |
| Ask | Question → answer from the ledger, with the figures shown | [ask-date.jpg](gate-2/ask-date.jpg), [ask-debtors.jpg](gate-2/ask-debtors.jpg) |

The calendar view was replaced by a day list, as approved at Gate 1.

## Recording by text
- The brief's example, "Tunde collect 2 crates egg, 9k, he go pay Friday", produced: 2 × Eggs (crate) at ₦4,500, ₦9,000 on credit, due 13 Nov. Confirm saved it, and Tunde's balance went from ₦63,250 to ₦72,250.
- Gemini returns amounts and dates as written; code converts naira to kobo, resolves dates in Lagos time, and matches names ("crates egg" → "Eggs (crate)").
- Anything unclear becomes a question and blocks saving: a price that might be per item or for all, whether a named customer paid, an unknown customer on a payment, totals that do not add up.
- The card is signed with `APP_SECRET` and expires in 30 minutes; a second tap on Confirm does not save twice.
- Supported: sales (cash, credit, part-paid), payments (allocated oldest-first), purchases, expenses, promises, new customers. Questions typed into the record box go to Ask.

## Supported questions
| Type | Example | Tested live |
|---|---|---|
| Any day | "Wetin happen on 14 October?" → ₦53,400 in 5 sales | Yes |
| A week or month | "How market dey this month?", "Profit last month?" | Unit test |
| One customer's balance and label | "How much Tunde owe me?" | Unit test |
| Who owes most | "Who owe me pass?" → Tunde ₦72,250, Bisi ₦44,000, … | Yes |
| Who is overdue | "Who don late?" | Unit test |
| Last payment | "When Tunde pay last?" | Unit test |
| Best day | "Which day I sell pass last month?" | Unit test |

Dates understood (in code): today, yesterday, tomorrow, next tomorrow, weekdays (forward for promises, back for questions), "last/next/this" + weekday, "14 October", "October 14", "14/10" (day first), "this/last week", "this/last month", month names.

## Decisions for Maris
1. **Answers are worded by code, not Gemini.** The brief says Gemini phrases answers from the data. I used fixed sentences instead, because Gemini's free tier allows only a few requests a minute and each takes 8–21 seconds; a second call would double both. Every number still comes from the ledger. Keep fixed wording? (Recommended: yes.)
2. **Gemini's free limit.** Two of six test notes hit "You exceeded your current quota" (HTTP 429). The app now says "Please wait a minute and try again" instead of hanging. During the live demo, space out recordings and questions by about 20 seconds. A paid key would remove this, but costs money. Accept the limit? (Recommended: yes.)

## Known limits
- Recording and asking take 8–21 seconds each, shown as "Reading your note…" or "Checking your book…".
- Gemini sometimes leaves out details (seen once: a purchase with no items). The builder then asks for them rather than saving something wrong.
- The demo shop now holds one real recorded sale (Tunde, ₦9,000, 6 Nov). It is demo-labelled like the rest.
- Promised dates on the card show as "2026-11-13" rather than "Fri 13 Nov".

## Next: Phase 3 (target 7 Nov)
Behaviour memories on Walrus through an outbox, recall-backed credit advice, label-change memories, month close and lesson, `/proof` page, and at least 10 confirmed mainnet memories.
