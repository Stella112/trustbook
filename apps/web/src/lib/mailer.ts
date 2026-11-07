import { createTransport } from "nodemailer";

/**
 * Sends Trustbook's few emails (password-reset links) through an SMTP account, by default Gmail
 * with an app password (approved 6 Nov). SMTP_USER and SMTP_PASSWORD live only in server settings.
 */
export const emailConfigured = () => process.env.SMTP_DRY_RUN === "1" || Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

/**
 * An image shown inside the email (for example a pay QR code). It travels as an attachment that the
 * HTML points to with src="cid:<cid>"; Gmail and most mail apps block images written into the HTML
 * as data, but show these.
 */
export interface InlineImage {
  cid: string;
  filename: string;
  content: Buffer;
}

export async function sendEmail(input: { to: string; subject: string; text: string; html: string; images?: InlineImage[] }) {
  // For testing: print the email instead of sending it.
  if (process.env.SMTP_DRY_RUN === "1") {
    const images = input.images?.length ? `\n[${input.images.length} inline image(s): ${input.images.map((i) => `${i.filename} ${i.content.length} bytes`).join(", ")}]` : "";
    console.info(`[email dry run] to ${input.to}: ${input.subject}\n${input.text}${images}`);
    return;
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new Error("email is not set up (SMTP_USER / SMTP_PASSWORD)");
  const transport = createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await transport.sendMail({
    from: `Trustbook <${user}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.images?.map((i) => ({ filename: i.filename, content: i.content, cid: i.cid, contentType: "image/png" })),
  });
}
