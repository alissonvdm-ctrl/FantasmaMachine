import { chromium } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";
import { config, getErpCredentials } from "@/lib/config";
import { decrypt } from "@/lib/crypto";
import { applyReadOnlyGuard, WriteAttemptError, type ReadOnlyGuard } from "@/worker/vendpago/readOnlyGuard";

function lancarSeBloqueado(guard: ReadOnlyGuard): void {
  const bloqueado = guard.getBlockedAttempt();
  if (bloqueado) {
    throw new WriteAttemptError(bloqueado.method, bloqueado.url);
  }
}

/**
 * Login e navegação até a tela de estoque do VendPago, retornando o HTML da
 * página para o parser. Usa `playwright-core` + `@sparticuz/chromium` (binário
 * compacto) em vez do `playwright` completo — compatível com função serverless
 * (Vercel) e com container comum (Decision 7 do DESIGN). Seletores baseados na
 * estrutura pública descrita no Brainstorm/DEFINE; o HTML real ainda não foi
 * capturado (Open Questions do DEFINE) — ajustar após a primeira execução
 * contra o ambiente real.
 */
export async function coletarHtmlEstoque(): Promise<string> {
  const { erpUser, erpPasswordEnc, encryptionKey } = getErpCredentials();
  const senha = decrypt(erpPasswordEnc, encryptionKey);

  const browser = await chromium.launch({
    args: sparticuzChromium.args,
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const guard = await applyReadOnlyGuard(context, config.erpHost);

    const page = await context.newPage();
    page.setDefaultTimeout(config.playwrightTimeoutMs);

    try {
      await page.goto(`https://${config.erpHost}/login`);
      await page.fill('input[name="usuario"]', erpUser);
      await page.fill('input[name="senha"]', senha);
      await page.click('button[type="submit"]');
      await page.waitForSelector("#menu-principal");

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
