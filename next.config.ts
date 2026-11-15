import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  typescript: {
    tsconfigPath:
      process.env.NEXT_BUILD_DIR === ".next-e2e" ? "tsconfig.e2e.json" : "tsconfig.json",
  },
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.env*", "./test-results/**/*", "./playwright-report/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
