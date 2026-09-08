import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: ":memory:",
      ADMIN_PASSWORD_HASH:
        "scrypt:cb8aed64d4360bdac5c6fa75447fd2a8:1bbcf8b086e42ff9dc1f211e0198de97929e00daf44113af54ddbac382e9b31c25b33be351e8117724c41c33d858ead31887152c81e7530b7be12415faa5690b",
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
