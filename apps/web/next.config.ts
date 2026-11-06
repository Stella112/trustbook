import { config } from "dotenv";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env, shared with the scripts. Only server code reads them.
config({ path: "../../.env" });

const nextConfig: NextConfig = {
  transpilePackages: ["@trustbook/ledger", "@trustbook/agent"],
};

export default nextConfig;
