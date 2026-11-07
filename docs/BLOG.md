# Trustbook: a credit book that remembers who pays, and can prove its own backup

_Draft for the Total Recall hackathon (Tatum × Walrus Memory). Edit freely before publishing._

Walk through any Nigerian market and you will see the same book: a worn exercise book where the trader writes who took goods on credit. "Tunde, 2 crates egg, ₦9,000, Friday." The book works, until it doesn't. Pages get wet. Friday becomes next Friday. And the most valuable thing in it, the trader's sense of who actually pays, lives only in her head.

I built **Trustbook** to keep that book and that sense, and to keep them safe.

## What it does

The owner types or says what happened, in Pidgin or English: "Tunde collect 2 crates egg, 9k, he go pay Friday." Trustbook reads it with Gemini and shows a card: a sale of ₦9,000 to Tunde, on credit, promised for Friday. Nothing is saved until she taps Confirm. The language model only reads words. Every naira is counted by plain code, in kobo, with no floating point, in a ledger that is append-only: mistakes are fixed with new correction entries, never by editing old ones.

From there she can see her day, her month and every customer, and ask questions like "Wetin happen on 14 October?". Each customer gets a trust label with its evidence: "Paid 0 of 6 on time · usually 5 days late · 4 promises broken." She can send a WhatsApp reminder from her own phone with a pay link and a QR code. The customer pays in USDC, or in SUI or another token that is swapped to USDC in the same payment. Trustbook pays the network fee from its own wallet, so neither the shop nor the customer needs SUI for gas.

## How it learns: Walrus Memory

A ledger tells you what is owed. It does not tell you the story: who paid late, who promised and broke it, who always comes back. That story is what Walrus Memory holds.

Every time something meaningful happens, Trustbook writes a small memory to Walrus: credit given, a payment and how many days late or early it was, a promise made, kept or broken, a trust label that changed, and a lesson when the month closes. Each memory is a line of JSON with a one-line summary, such as "Tunde paid ₦41,250, 36 days after the promised date." It also carries its own date, because restored memories may not keep their original time.

When the owner is about to give credit, Trustbook **recalls** that customer's memories from the last three months and puts the most telling ones under the advice, warning signs first. The numbers always come from the ledger; the memories are the evidence. When I recorded Tunde's late payment in the app, a few minutes later the advice for Tunde had changed: the top memory went from "Tunde paid ₦5,400, 4 days after the promised date" to "Tunde paid ₦41,250, 36 days after the promised date", the one just written. His label stayed **Careful**, and the card said why: four broken promises in sixty days. That is the rule doing its job, in words the trader can check.

A memory only counts once Walrus confirms it and returns a blob ID. Writes go through an outbox that retries, because mainnet writes take 20–30 seconds and the relayer has had bad days. At the time of writing, **47 behaviour memories are confirmed on Walrus mainnet**, each listed with its blob ID on the app's `/proof` page.

## Keeping the books: Walrus as the backup that can prove itself

Anyone can say "we back up your data". I wanted Trustbook to prove it.

Every night, each closed day becomes a **day record**: its entries, its totals, and the fingerprint (SHA-256 hash) of the day before. Days are bundled into weekly records, encrypted with Seal to two open key servers, and stored on Walrus. Each month gets a checkpoint with its totals and who owed what. Then Trustbook writes the newest day's fingerprint to a tiny Move object on Sui, the **head anchor**.

Why the anchor? A chain of fingerprints catches an edited or missing day in the middle, but if someone deletes the *newest* days, the chain just looks shorter. The anchor on Sui says "42 days, ending 5 November, with this fingerprint", so a shortened chain is caught.

The recovery tool is separate from the app and never touches its database. With only the Walrus key and a Tatum key, it found the records, read the anchor through Tatum, and printed:

```
Fingerprints ........ 42/42 day records match, 2/2 checkpoints match     PASS
Chain ............... unbroken GENESIS → 2026-11-05                      PASS
Complete vs anchor .. 42 = 42, head hash matches                         PASS
Totals .............. 2026-09, 2026-10 match sealed checkpoints (0 kobo diff) PASS
Behaviour memory .... 47/47 memories restored                            PASS
RESULT: BOOKS COMPLETE AND UNCHANGED
```

Then the real test: I wiped a copy of the database, recovered the books from Walrus and Sui, imported them into an empty database, and asked for credit advice again. For all eight customers, the label, the numbers and the quoted memories were **identical before and after**. The learning survived the wipe.

Judges can run the same proof in their browser on `/verify`, and press "Try tampering" to watch it fail: change one amount and the fingerprint check names the day; delete a day and the chain check names the gap; drop the newest day and only the Sui anchor notices.

## Tatum: every read from Sui

All Sui traffic goes through Tatum's Sui GraphQL gateway. Tatum is how Trustbook reads the latest checkpoint and the head anchor, builds and sends the shop-sponsored payments, and, most importantly, **verifies every payment** before it is recorded. It fetches the transaction by its ID, checks it succeeded, and checks that the shop's USDC balance went up by at least the quoted amount. A transaction ID can only ever be recorded once. The naira-to-USDC rate comes from Tatum's data API. Even the token swap router is wired to use Tatum's client, so no other Sui node is involved.

## What I learned

- **Recall is search, not a database.** Walrus Memory recall returns the most relevant memories, not all of them, so Trustbook never computes money from memory. Exact numbers live in the ledger; memory holds the story.
- **Design for the limits.** One restore call looks at 100 blobs at most, so namespaces are per month. Mainnet writes are slow, so nothing waits on them.
- **Free tiers are small.** Gemini's free tier allowed 20 requests a day for one model, so Trustbook falls back to other free models. Tatum's free tier rate-limits, so reads are batched and retried.

## Honest limits

The hosted relayer sees memory text in plain form while it embeds it, so only demo data is stored for now; client-side encryption is the next step. Walrus storage expires (the demo's records are safe until June 2027), and renewing it needs the owner's wallet. Today's entries are sealed tonight, not instantly. Trust labels are explainable rules for one shop, not a credit score. Sign in with Google is left out because zkLogin on mainnet needs a paid plan.

Trustbook is open source: https://github.com/Stella112/trustbook. Try the demo shop at https://trustbook-app.vercel.app (open `/onboarding` and choose "Open the demo shop"), or check the books yourself at https://trustbook-app.vercel.app/verify.
