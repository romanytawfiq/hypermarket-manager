import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  ...(process.env.NEXT_E2E_DIST ? { distDir: process.env.NEXT_E2E_DIST } : {}),
  // This project lives inside a wider directory that has its own git repo and
  // package-lock.json; pin Turbopack to the project root so it does not climb
  // up and warn about the ignored lockfile.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
