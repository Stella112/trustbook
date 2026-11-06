import { z } from "zod";

/**
 * What the language model proposes from an owner's note. Numbers come back as text ("9k", "4,500")
 * and dates as phrases ("Friday"), so money and dates are always worked out in code, never by the model.
 */
export const KINDS = ["record_sale", "record_payment", "record_purchase", "record_expense", "add_promise", "add_customer", "ask_question", "unclear"] as const;

const Item = z.object({
  name: z.string().min(1),
  qty: z.string().min(1),
  unitPrice: z.string().optional(),
  lineTotal: z.string().optional(),
});

export const Proposal = z.object({
  kind: z.enum(KINDS),
  customerName: z.string().optional(),
  items: z.array(Item).optional(),
  total: z.string().optional(),
  paidNow: z.string().optional(),
  paidInFull: z.boolean().optional(),
  onCredit: z.boolean().optional(),
  amount: z.string().optional(),
  method: z.enum(["cash", "transfer"]).optional(),
  supplier: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
  promiseDatePhrase: z.string().optional(),
  whenPhrase: z.string().optional(),
  phone: z.string().optional(),
  question: z.string().optional(),
  clarifications: z.array(z.string()).default([]),
});
export type Proposal = z.infer<typeof Proposal>;

/** The same shape as JSON Schema for Gemini's structured output. */
export const proposalJsonSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...KINDS] },
    customerName: { type: "string", description: "Customer's name exactly as written, if any" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item as written, e.g. 'crates egg'" },
          qty: { type: "string", description: "Quantity as written, e.g. '2'" },
          unitPrice: { type: "string", description: "Price for ONE unit, only if the note says so" },
          lineTotal: { type: "string", description: "Price for this line in total, if the note gives it" },
        },
        required: ["name", "qty"],
      },
    },
    total: { type: "string", description: "Total for the whole sale or purchase as written, e.g. '9k'" },
    paidNow: { type: "string", description: "Amount paid right now, if part was paid" },
    paidInFull: { type: "boolean", description: "True if the note says it was fully paid now" },
    onCredit: { type: "boolean", description: "True if the customer will pay later" },
    amount: { type: "string", description: "Amount of a payment or expense as written" },
    method: { type: "string", enum: ["cash", "transfer"] },
    supplier: { type: "string" },
    category: { type: "string", description: "Expense category, e.g. transport, rent, levy" },
    note: { type: "string" },
    promiseDatePhrase: { type: "string", description: "When the customer said they will pay, as written, e.g. 'Friday'" },
    whenPhrase: { type: "string", description: "When it happened, only if not today, as written, e.g. 'yesterday'" },
    phone: { type: "string" },
    question: { type: "string", description: "For ask_question: the question" },
    clarifications: { type: "array", items: { type: "string" }, description: "Questions to ask the owner about anything unclear" },
  },
  required: ["kind", "clarifications"],
} as const;
