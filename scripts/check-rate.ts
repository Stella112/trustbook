import { report, requireEnv } from "./lib.js";

requireEnv("USDC->NGN rate", "TATUM_API_KEY");
const r = await fetch("https://api.tatum.io/v4/data/rate/symbol?symbol=USDC&basePair=NGN", {
  headers: { "x-api-key": process.env.TATUM_API_KEY! },
});
report("USDC->NGN rate", r.ok ? "PASS" : "FAIL", `${r.status} ${await r.text()}`);
