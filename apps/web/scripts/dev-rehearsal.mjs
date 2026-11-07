// Runs the app locally against the separate rehearsal database (trustbook_rehearsal), so sign-up,
// login and PIN flows can be tried without touching the real one. Reads ../../.env and changes only
// the database name; prints no secrets.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "../../../.env"), "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing in .env");
const url = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, ""));
url.pathname = "/trustbook_rehearsal";

const child = spawn("pnpm", ["exec", "next", "dev", "--port", process.argv[2] ?? "3200"], {
  cwd: join(here, ".."),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: url.toString(), APP_URL: `http://localhost:${process.argv[2] ?? "3200"}` },
});
child.on("exit", (code) => process.exit(code ?? 0));
