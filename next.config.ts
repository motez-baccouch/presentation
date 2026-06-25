import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile lives in the
  // home directory, which otherwise confuses Next's root inference).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
