import { createTransport } from "nodemailer";

/**
 * Sends Trustbook's few emails (password-reset links) through an SMTP account, by default Gmail
 * with an app password (approved 6 Nov). SMTP_USER and SMTP_PASSWORD live only in server settings.
 */
export const emailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

export async function sendEmail(input: { to: string; subject: string; text: string; html: string }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new Error("email is not set up (SMTP_USER / SMTP_PASSWORD)");
  const transport = createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await transport.sendMail({ from: `Trustbook <${user}>`, to: input.to, subject: input.subject, text: input.text, html: input.html });
}
