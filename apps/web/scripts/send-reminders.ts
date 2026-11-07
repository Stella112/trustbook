// Sends today's payment reminders now (the same job the 06:00 Lagos cron runs). Needs SMTP_USER and
// SMTP_PASSWORD; without them it reports that email is not set up and sends nothing.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
const { sendDueReminders } = await import("../src/reminders/send");
const { closeDb } = await import("../src/db/client");
console.log(JSON.stringify(await sendDueReminders()));
await closeDb();
