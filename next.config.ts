import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const isCapacitorApp = process.env.CAPACITOR_APP === "true";
const isStaticExport = isGitHubPages || isCapacitorApp;
const publicBasePath = isGitHubPages ? "/coding-helper" : "";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: publicBasePath,
    NEXT_PUBLIC_NATIVE_APP: isCapacitorApp ? "true" : "false",
  },
};

export default nextConfig;
