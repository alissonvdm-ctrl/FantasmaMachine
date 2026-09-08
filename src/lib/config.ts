function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + key);
  return value;
}

export const config = {
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  erpHost: process.env.VENDPAGO_HOST ?? "www.erpvending.com.br",
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  sessionSecret: required("SESSION_SECRET"),
  syncCron: process.env.SYNC_CRON ?? "0 7,13,20 * * *",
  playwrightTimeoutMs: Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 45000),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;

/**
 * A credencial do VendPago só é lida pelo processo worker (Security Considerations
 * do DESIGN: "ausente do processo web"). Por isso não integra `config` acima —
 * ficaria exigida eagerly em todo import, inclusive no processo web.
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
