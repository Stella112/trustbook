import { ApiError, GoogleGenAI } from "@google/genai";
import { Proposal, proposalJsonSchema } from "./proposal";

// The only module in Trustbook that calls Gemini (brief §3.1).

const INSTRUCTIONS = `You read short notes from a Nigerian market trader, in Pidgin or English, and turn each into ONE action for her shop book.
Rules:
- For record_sale and record_purchase, ALWAYS fill items with every item named, each with its name and qty.
- Never calculate or convert money. Copy amounts exactly as written ("9k", "4,500", "38k").
- Never turn dates into calendar dates. Copy date words exactly as written ("Friday", "next tomorrow", "14 October").
- "collect", "carry", "take" with a customer usually means a sale. "don pay", "pay me" means a payment. "I buy ... from" means a purchase.
- "he go pay", "she go bring money", "on credit", "owe" mean onCredit = true. Put the pay-by words in promiseDatePhrase.
- If a price could be for each item or for all items, put it in total for a single item, or add a clarification.
- Use the customer and item names the shop already has when they clearly match.
- If the note is a question about the business, use ask_question and copy the question.
- If you cannot tell what the owner means, use unclear and add a clarification in simple words.
Examples:
"Tunde collect 2 crates egg, 9k, he go pay Friday" -> record_sale, customerName "Tunde", items [{name "crates egg", qty "2"}], total "9k", onCredit true, promiseDatePhrase "Friday".
"Mama Ngozi don pay 5k" -> record_payment, customerName "Mama Ngozi", amount "5k".
"I buy 10 crates egg 38k from Alhaji" -> record_purchase, supplier "Alhaji", items [{name "crates egg", qty "10", lineTotal "38k"}].
"transport 1500" -> record_expense, category "transport", amount "1500".
"Wetin I sell yesterday?" -> ask_question, question "Wetin I sell yesterday?".`;

export interface ParseContext {
  customerNames: string[];
  itemNames: string[];
}

let client: GoogleGenAI | undefined;
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one JSON-schema request, retrying when Gemini is busy (503) or rate-limited (429), which
 * Phase 0 saw on the free tier.
 */
export async function generateJson(prompt: string, schema: object, system: string): Promise<unknown> {
  const model = process.env.GEMINI_MODEL;
  if (!model) throw new Error("GEMINI_MODEL is not set");
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await ai().models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0 },
      });
      if (!r.text) throw new Error("Gemini returned no text");
      return JSON.parse(r.text);
    } catch (err) {
      last = err;
      // The free tier allows only a few requests a minute; waiting inside a request would hang the
      // screen, so a quota error is reported straight away.
      if (err instanceof ApiError && err.status === 429) throw new QuotaError();
      const retryable = err instanceof ApiError && err.status >= 500;
      if (!retryable) break;
      await sleep(800 * 2 ** attempt);
    }
  }
  throw new Error(`The language service is busy. Please try again. (${last instanceof Error ? last.message.slice(0, 120) : String(last)})`);
}

export class QuotaError extends Error {
  constructor() {
    super("Gemini's free limit was reached. Please wait a minute and try again.");
  }
}

/** Turns an owner's note into a validated proposal. Money and dates stay as text for code to resolve. */
export async function parseNote(note: string, ctx: ParseContext): Promise<Proposal> {
  const prompt = [
    `Known customers: ${ctx.customerNames.join(", ") || "none yet"}`,
    `Known items: ${ctx.itemNames.join(", ") || "none yet"}`,
    `Note: ${note}`,
  ].join("\n");
  const raw = await generateJson(prompt, proposalJsonSchema, INSTRUCTIONS);
  const parsed = Proposal.safeParse(raw);
  if (!parsed.success) return { kind: "unclear", clarifications: ["I could not read that clearly. Please say it another way."] };
  return parsed.data;
}
