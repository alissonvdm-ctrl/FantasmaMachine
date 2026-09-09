function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + key);
  return value;
}

/**
 * O painel da Vercel já salvou mais de uma variável como string vazia em vez
 * de ausente (ver Decision 7 do DESIGN) — `??` não pega esse caso, só
 * `null`/`undefined`. Variáveis com valor padrão usam esta função em vez de
 * `??` direto para não ficar vulnerável ao mesmo bug silenciosamente (aqui
 * não há `required()` para acusar o problema, já que têm um padrão válido).
 */
function optional(key: string, valorPadrao: string): string {
  const value = process.env[key];
  return value && value.trim() !== "" ? value : valorPadrao;
}

export const config = {
  databaseUrl: optional("DATABASE_URL", "file:./data/app.db"),
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  erpHost: optional("VENDPAGO_HOST", "www.erpvending.com.br"),
  vendtefHost: optional("VENDTEF_HOST", "www.portalvendtef.com.br"),
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  sessionSecret: required("SESSION_SECRET"),
  cronSecret: required("CRON_SECRET"),
  playwrightTimeoutMs: Number(optional("PLAYWRIGHT_TIMEOUT_MS", "45000")),
  logLevel: optional("LOG_LEVEL", "info"),
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
