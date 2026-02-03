import type { NextConfig } from "next";

const useStandalone = process.env.NEXT_DISABLE_STANDALONE !== "1";

const nextConfig: NextConfig = {
  ...(useStandalone ? { output: "standalone" } : {}),
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
