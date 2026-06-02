import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.resolve("."),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // The SDK is vendored as TypeScript source (no prebuilt dist), so Next must
  // transpile it like first-party code.
  transpilePackages: ["bridge-sdk"],
  webpack: (config) => {
    // Ensure extensionless TS imports inside the vendored SDK resolve.
    config.resolve.extensions = Array.from(
      new Set([".ts", ".tsx", ".mjs", ".js", ".json", ...config.resolve.extensions])
    );
    return config;
  },
};

export default nextConfig;
