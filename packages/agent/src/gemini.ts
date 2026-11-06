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
 * The models to try, in order. The free tier's daily request quota is counted per model (verified
 * 6 Nov: `gemini-3.6-flash` allows 20 requests a day), so when one model's quota runs out the next
 * one answers. GEMINI_FALLBACK_MODELS is a comma-separated list of models seen in `models.list`.
 */
function models(): string[] {
  const primary = process.env.GEMINI_MODEL;
  if (!primary) throw new Error("GEMINI_MODEL is not set");
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

/**
 * Sends one JSON-schema request. A busy model (5xx) is retried with backoff; a model whose quota is
 * used up (429) hands over to the next model at once, because waiting would hang the owner's screen.
 */
async function generate(contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"], schema: object, system: string): Promise<unknown> {
  let last: unknown;
  let quotaHits = 0;
  const list = models();
  for (const model of list) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await ai().models.generateContent({
          model,
          contents,
          config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0 },
        });
        if (!r.text) throw new Error("Gemini returned no text");
        return JSON.parse(r.text);
      } catch (err) {
        last = err;
        if (err instanceof ApiError && err.status === 429) {
          quotaHits++;
          break; // next model
        }
        if (!(err instanceof ApiError && err.status >= 500)) break;
        await sleep(800 * 2 ** attempt);
      }
    }
  }
  if (quotaHits === list.length) throw new QuotaError();
  throw new Error(`The language service is busy. Please try again. (${last instanceof Error ? last.message.slice(0, 120) : String(last)})`);
}

export async function generateJson(prompt: string, schema: object, system: string): Promise<unknown> {
  return generate(prompt, schema, system);
}

export class QuotaError extends Error {
  constructor() {
    super("Gemini's free limit for today was reached. Please type the note or try again later.");
  }
}

const TRANSCRIBE = `Write down exactly what this market trader says in the voice note, in the words she uses (Pidgin or English).
Do not translate, summarise or correct it. Write amounts the way they are said ("nine thousand", "9k"). If nothing is said, return an empty string.`;

/**
 * Writes down a voice note (brief P1 "voice notes"). The text then goes through the same reading and
 * confirmation card as a typed note, so the owner sees what was heard before anything is saved.
 */
export async function transcribeVoiceNote(audio: Uint8Array, mimeType: string, ctx?: ParseContext): Promise<string> {
  // The shop's own names, so a name like "Tunde" is not heard as an ordinary word ("today").
  const hints = ctx ? `\nNames this shop uses — customers: ${ctx.customerNames.join(", ") || "none"}; items: ${ctx.itemNames.join(", ") || "none"}. Spell them like this when you hear them.` : "";
  const parsed = (await generate(
    [{ role: "user", parts: [{ inlineData: { mimeType, data: Buffer.from(audio).toString("base64") } }, { text: "Transcribe this voice note." }] }],
    { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    TRANSCRIBE + hints,
  )) as { text?: unknown };
  return typeof parsed.text === "string" ? parsed.text.trim() : "";
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
