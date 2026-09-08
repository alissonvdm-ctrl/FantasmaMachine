function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + key);
  return value;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/app.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  erpHost: process.env.VENDPAGO_HOST ?? "www.erpvending.com.br",
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  sessionSecret: required("SESSION_SECRET"),
  cronSecret: required("CRON_SECRET"),
  playwrightTimeoutMs: Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 45000),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;

/**
 * A credencial do VendPago só é lida pela rota de sincronização (Security
 * Considerations do DESIGN: "ausente do processo web" em geral). Por isso
 * não integra `config` acima — ficaria exigida eagerly em todo import.
 */
export interface ErpCredentials {
  erpUser: string;
  erpPasswordEnc: string;
  encryptionKey: string;
}

export function getErpCredentials(): ErpCredentials {
  return {
    erpUser: required("VENDPAGO_USER"),
    erpPasswordEnc: required("VENDPAGO_PASSWORD_ENC"),
    encryptionKey: required("ENCRYPTION_KEY"),
  };
}
