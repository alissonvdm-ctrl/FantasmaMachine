import { chromium, type Browser, type Page } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";
import { config, getErpCredentials } from "@/lib/config";
import { decrypt } from "@/lib/crypto";
import { applyReadOnlyGuard, WriteAttemptError, type ReadOnlyGuard } from "@/worker/vendpago/readOnlyGuard";

/** Único caminho autorizado a fazer POST no ERP — estabelece sessão, não altera dado de negócio. */
export const LOGIN_PATH_PREFIX = "/auth/login";

function lancarSeBloqueado(guard: ReadOnlyGuard): void {
  const bloqueado = guard.getBlockedAttempt();
  if (bloqueado) {
    throw new WriteAttemptError(bloqueado.method, bloqueado.url);
  }
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: sparticuzChromium.args,
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });
}

/**
 * Faz login no VendPago se a navegação cair na tela de login (form real:
 * `#username`, `#password`, botão `#login`, POST para `/auth/login/index`).
 * Não faz nada se a página já estiver autenticada.
 */
export async function loginNoVendPagoSeNecessario(page: Page, guard: ReadOnlyGuard): Promise<void> {
  if (!page.url().includes(LOGIN_PATH_PREFIX)) return;

  const { erpUser, erpPasswordEnc, encryptionKey } = getErpCredentials();
  const senha = decrypt(erpPasswordEnc, encryptionKey);

  await page.fill("#username", erpUser);
  await page.fill("#password", senha);
  await page.click("#login");
  await page.waitForURL((url) => !url.pathname.includes(LOGIN_PATH_PREFIX));
  lancarSeBloqueado(guard);
}

/**
 * Login e navegação até a tela de estoque do VendPago, retornando o HTML da
 * página para o parser. Usa `playwright-core` + `@sparticuz/chromium` (binário
 * compacto) em vez do `playwright` completo — compatível com função serverless
 * (Vercel) e com container comum (Decision 7 do DESIGN).
 */
export async function coletarHtmlEstoque(): Promise<string> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const guard = await applyReadOnlyGuard(context, config.erpHost, [LOGIN_PATH_PREFIX]);

    const page = await context.newPage();
    page.setDefaultTimeout(config.playwrightTimeoutMs);

    try {
      await page.goto(`https://${config.erpHost}/produtos`);
      await loginNoVendPagoSeNecessario(page, guard);

      // TODO: ajustar para a URL real da tela de estoque por mola quando confirmada
      // (ver Open Questions do DEFINE — pendente de reconhecimento em produção).
      await page.goto(`https://${config.erpHost}/estoque`);
      await page.waitForSelector("#tabela-estoque");

      const html = await page.content();
      lancarSeBloqueado(guard);
      return html;
    } catch (err) {
      // Uma tentativa de escrita bloqueada costuma se manifestar como timeout
      // ou falha de navegação genérica — a causa raiz real é sempre priorizada.
      lancarSeBloqueado(guard);
      throw err;
    }
  } finally {
    await browser.close();
  }
}
