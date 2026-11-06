# Trustbook demo script (2–3 minutes)

Follows the brief's demo (§6.11), using only things that really happen on mainnet.

## Before you record

1. **Record on 7, 8 or 9 November.** Emeka's ₦24,750 debt is due on 9 November; after that his payment counts as late and his label will not turn "Good payer".
2. **Record in two sittings, a day apart.** Days are sealed to Walrus each night (00:15–01:15 Lagos). Do steps 1–3 on day one; the nightly seal saves them; do steps 4–6 the next day, so the recovered books include what you recorded.
3. **Run the read-only check** from `apps/web`. Every line should say OK, including "Emeka label change":
   ```bash
   npx tsx scripts/demo-check.ts
   ```
4. **Gemini allows about 20 requests a day per model** on the free tier. Each typed or spoken note uses one or two. Rehearse the day before, not the morning of.
5. Have a Sui wallet on your phone with a little USDC (about 0.1) or SUI, and a WhatsApp chat ready.
6. Open the demo shop on the phone: `/onboarding` → **Open the demo shop**.

## The script

**0:00 — The problem (10 s).** "This is Mama Ngozi's shop. Like many traders, she gives credit and keeps it in a notebook. Trustbook keeps that book, learns who pays, and keeps it safe on Walrus."

**0:10 — 1. Record in Pidgin (25 s).** On **Record**, tap **🎤 Say it instead** and say: *"Emeka collect one bag rice, five thousand, he go pay Monday."* (Or type it.) Show the card: a sale of ₦5,000 to Emeka, on credit, promised for Monday. Tap **Confirm**. "Nothing is saved until she confirms, and the AI never does the maths."

**0:35 — 2. A late payer asks for credit (25 s).** Type *"Tunde collect 2 crates egg, 9k"*. **Don't confirm.** Point to the red advice card: **Careful**, "Paid 0 of 6 on time · usually 5 days late · 4 promises broken", the suggested limit, and **Remembered on Walrus**: real memories with their blob IDs. "The numbers come from the ledger. The evidence comes from Walrus Memory." Go back without saving.

**1:00 — 3. Getting paid (40 s).**
- Open **Customers → Tunde**. Show **Send reminder on WhatsApp** (the message opens with the pay link) and **Show QR code**.
- Open the pay link, connect the wallet, and pay a small amount (make a ₦100 link if you like; the shop pays the gas). Choose **USDC**, or **SUI** to show the swap. Show the receipt: **Verified on Sui**, checked through Tatum.
- Back on **Emeka**: tap **Mark as paid** for the full amount (cash). His label changes **New → Good payer**: "Paid 3 of 3 on time". "It learns from what customers do."

**1:40 — 4. Delete the database (30 s).** In a terminal (from `apps/web`):
```bash
npx tsx scripts/rehearse-recovery.ts
```
"This wipes a separate copy of the database and rebuilds it only from Walrus and the Sui anchor, read through Tatum." Show the report: every line **PASS**, ending **BOOKS COMPLETE AND UNCHANGED**.

**2:10 — 5. The learning survives (15 s).** Scroll to the end: BEFORE and AFTER side by side for Tunde, with the same label, numbers and remembered evidence, and **RESULT: IDENTICAL** for all customers.

**2:25 — 6. Judges can check it themselves (25 s).** Open `/verify` → **Verify these books**: all steps PASS in the browser. Pick **Drop the newest day**: only "Complete vs anchor" fails, because the Sui anchor knows how many days there should be. Then **No tampering** to go back to PASS. Finish on `/proof`: Walrus and Tatum status, confirmed memories with blob IDs, and verified payments.

**2:50 — Close (10 s).** "Trustbook: the credit book that learns who pays, and can prove its own backup."

## If something goes wrong

| Problem | What to do |
|---|---|
| "Gemini's free limit for today was reached" | Type the note on the Record screen later, or show step 2 from a customer page instead (the advice card is there too). |
| Wallet will not connect on the pay page | Use **Mark as paid** for the payment step and show an earlier verified payment on `/proof`. |
| Recovery says the relayer is unreachable | Run it again a minute later; the tool retries. The blob IDs are on `/proof` if needed. |
| `/verify` is slow the first time | The first run reads 11 records from Walrus (about a minute); later runs are quick. Open it once before recording. |
