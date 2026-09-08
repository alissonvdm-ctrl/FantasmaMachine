/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client", "playwright-core", "@sparticuz/chromium"],
    // O binário do Chromium (bin/*.br) só é referenciado dinamicamente pelo
    // @sparticuz/chromium — o file tracing da Vercel não o inclui sozinho.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    },
  },
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
