import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_R2_PUBLIC_HOST || "quiz-media.asia-spark.org",
      },
    ],
  },
};

export default nextConfig;
