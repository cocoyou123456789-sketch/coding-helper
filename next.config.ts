import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const publicBasePath = isGitHubPages ? "/coding-helper" : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
      output: "export" as const,
        trailingSlash: true,
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: publicBasePath,
  },
};

export default nextConfig;
