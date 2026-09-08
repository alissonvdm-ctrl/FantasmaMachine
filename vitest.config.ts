import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: ":memory:",
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=16,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2h2YWx1ZQ",
      SESSION_SECRET: "test-session-secret-not-for-production",
      CRON_SECRET: "test-cron-secret-not-for-production",
      VENDPAGO_HOST: "www.erpvending.com.br",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
