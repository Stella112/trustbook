import { formatNaira, type ReminderDue } from "@trustbook/ledger";

/**
 * The reminder a customer receives, by WhatsApp (sent by the owner with one tap) or by email (sent
 * automatically on the promised day). One wording for both, built from ledger numbers.
 */
/** How the customer can pay, said the same way in every reminder (WhatsApp and email). */
export const payLine = (payUrl: string) => `You can pay with Sui (USDC or other tokens) here: ${payUrl}`;

export function reminderMessage(input: { customerName: string; shopName: string; due: ReminderDue; payUrl: string }): string {
  const { customerName, shopName, due, payUrl } = input;
  const what =
    due.dueTodayKobo > 0
      ? `Today is the day you promised to pay ${formatNaira(due.dueTodayKobo)}${due.overdueKobo > 0 ? `, and ${formatNaira(due.overdueKobo)} is already overdue` : ""}.`
      : `${formatNaira(due.overdueKobo)} is now ${due.daysOverdue} day${due.daysOverdue === 1 ? "" : "s"} past the date you promised.`;
  return `Hello ${customerName}, this is ${shopName}. ${what} In all you owe ${formatNaira(due.owedKobo)}. ${payLine(payUrl)} Thank you!`;
}
