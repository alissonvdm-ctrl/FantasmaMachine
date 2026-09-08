import type { BrowserContext } from "playwright-core";

export class WriteAttemptError extends Error {
  constructor(method: string, url: string) {
    super("Tentativa de escrita bloqueada: " + method + " " + url);
    this.name = "WriteAttemptError";
  }
}

export interface BlockedAttempt {
  method: string;
  url: string;
}

export interface ReadOnlyGuard {
  getBlockedAttempt(): BlockedAttempt | null;
}

/**
 * Transforma "somente leitura" num invariante executável (Decision 2 do
 * DESIGN). Registra a tentativa bloqueada em vez de lançar de dentro do
 * handler de rota: o Playwright invoca esse handler a partir de um listener
 * de evento que não propaga a exceção para quem chamou page.goto()/click()
 * — lançar ali vira unhandled rejection, não erro no chamador. O chamador
 * (scraper.ts) deve checar getBlockedAttempt() e lançar WriteAttemptError.
 */
export async function applyReadOnlyGuard(context: BrowserContext, erpHost: string): Promise<ReadOnlyGuard> {
  let blocked: BlockedAttempt | null = null;

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isErp = url.host === erpHost;
    const isRead = request.method() === "GET";

    if (isErp && !isRead) {
      blocked = { method: request.method(), url: request.url() };
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  return {
    getBlockedAttempt: () => blocked,
  };
}
