import { GoogleGenAI } from "@google/genai";
import { report, requireEnv } from "./lib.js";

requireEnv("gemini", "GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const names: string[] = [];
for await (const model of await ai.models.list()) if (model.name) names.push(model.name);
report("list models", names.length ? "PASS" : "FAIL", names.filter((n) => /flash/i.test(n)));
const model = process.env.GEMINI_MODEL;
if (!model) {
  report("parse Pidgin", "SKIPPED", "set GEMINI_MODEL from the list above");
  process.exit(0);
}
const r = await ai.models.generateContent({
  model,
  contents: "Parse this shop note: Tunde collect 2 crates egg, 9k, he go pay Friday",
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: {
      type: "object",
      properties: {
        action: { type: "string" },
        customer: { type: "string" },
        totalNaira: { type: "number" },
        clarifications: { type: "array", items: { type: "string" } },
      },
      required: ["action", "customer", "clarifications"],
    },
  },
});
report("parse Pidgin", r.text ? "PASS" : "FAIL", r.text ?? "");
