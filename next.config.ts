import type { NextConfig } from "next";

const config: NextConfig = {
  // SQLite runs server-side only; keep it out of the client bundle
  serverExternalPackages: ["better-sqlite3"],
};

export default config;
