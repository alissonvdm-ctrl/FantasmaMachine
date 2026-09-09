import { chromium, type Browser, type Page } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";
import { config, getErpCredentials } from "@/lib/config";
import { decrypt } from "@/lib/crypto";
import { applyReadOnlyGuard, WriteAttemptError, type ReadOnlyGuard } from "@/worker/vendpago/readOnlyGuard";

/** Único caminho autorizado a fazer POST no ERP — estabelece sessão, não altera dado de negócio. */
export const LOGIN_PATH_PREFIX = "/auth/login";

/**
 * Sufixo comum a todos os endpoints AJAX de leitura do VendPago observados em
 * produção até agora (`/produtos/listar/format/json`,
 * `/estoque-interno/carregaRelatorioEstoque/format/json`): o verbo muda por
 * tela, mas o sufixo `/format/json` é a convenção do próprio framework para
 * respostas JSON — sinal mais confiável de "endpoint de leitura de dado
 * tabular" do que tentar prever cada nome de verbo tela por tela.
 */
export const LISTING_PATH_PATTERN = "/format/json";

export interface LinkPagina {
  text: string;
  href: string;
}

/**
 * O VendPago não compartilha sessão automaticamente entre domínios irmãos
 * (erpvending.com.br, portalvendtef.com.br, portalpayblu.com.br): navegar
 * direto para uma URL de destino num desses domínios volta para a tela de
 * login. A página autenticada do erpvending.com.br expõe, nas abas de
 * navegação (ERP/VendTEF/PayBlu), um link de handoff de SSO com token de uso
 * único (`https://<host-destino>/token/<token>/link_redirect/...`) —
 * visitar esse link antes da URL de destino real estabelece a sessão lá.
 */
export function encontrarLinkHandoffSso(links: readonly LinkPagina[], hostDestino: string): string | null {
  for (const link of links) {
    try {
      if (new URL(link.href).host === hostDestino) return link.href;
    } catch {
      continue;
    }
  }
  return null;
}

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

/** Ids reais dos controles de paginação de `/produtos` (ver reconhecimento em produção). */
const PRODUTOS_PAGINACAO_INFO_ID = "produtos-table-pagination-info";
const PRODUTOS_PAGINACAO_BOTOES_ID = "produtos-table-pagination-buttons";

/**
 * O VendPago mostra um modal de "novidades" (`#modal_novidades`) ao entrar
 * na área logada, cujo backdrop intercepta cliques em qualquer elemento por
 * baixo — inclusive o botão de próxima página. Fechado via mutação direta do
 * DOM (não um clique real): um clique no botão "Fechar" do modal poderia
 * disparar um POST (ex.: marcar notificação como lida) que o ReadOnlyGuard
 * bloquearia, transformando um simples dispensar de popup num erro de
 * segurança. `page.evaluate` só manipula o DOM local, sem rede.
 */
async function fecharModalDeNovidadesSeAberto(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      document.getElementById("modal_novidades")?.remove();
      document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
      document.body.classList.remove("modal-open");
    })
    .catch(() => {});
}

async function extrairLinksDaPagina(page: Page): Promise<LinkPagina[]> {
  return page.$$eval("a[href]", (anchors) =>
    anchors
      .map((a) => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href") ?? "" }))
      .filter((l) => l.href && l.href !== "#"),
  );
}

/**
 * `/produtos` pagina no máximo 20 itens por vez (o próprio seletor "Exibir"
 * não oferece opção maior) — coleta o HTML de cada página clicando em
 * "próxima" até acumular o total anunciado em `produtos-table-pagination-info`
 * ("Mostrando 1–20 de 22 produtos"), sem assumir um número fixo de páginas.
 */
export async function coletarPaginasProdutos(page: Page): Promise<string[]> {
  await fecharModalDeNovidadesSeAberto(page);
  const paginas: string[] = [await page.content()];

  const infoTexto = await page.locator(`#${PRODUTOS_PAGINACAO_INFO_ID}`).innerText();
  const total = Number(infoTexto.match(/de (\d+)/)?.[1] ?? paginas.length);
  const porPagina = Number(infoTexto.match(/–(\d+) de/)?.[1] ?? total);

  let coletados = porPagina;
  while (coletados < total) {
    await page.locator(`#${PRODUTOS_PAGINACAO_BOTOES_ID}`).getByText("chevron_right", { exact: true }).click();
    await page.waitForTimeout(500);
    paginas.push(await page.content());
    const proximaInfo = await page.locator(`#${PRODUTOS_PAGINACAO_INFO_ID}`).innerText();
    const ateAgora = Number(proximaInfo.match(/–(\d+) de/)?.[1] ?? coletados);
    if (ateAgora <= coletados) break; // segurança: evita loop infinito se a paginação não avançar
    coletados = ateAgora;
  }
  return paginas;
}

export interface DadosColetados {
  produtosHtmls: string[];
  estoqueHtml: string;
}

/**
 * Login e navegação por todas as fontes de dados do VendPago necessárias à
 * sincronização (Decision 2, amendments): catálogo de produtos (com
 * paginação) para resolver nome→código, e o relatório de estoque da máquina
 * em portalvendtef.com.br (via handoff de SSO). Usa `playwright-core` +
 * `@sparticuz/chromium` (binário compacto) em vez do `playwright` completo —
 * compatível com função serverless (Vercel) e com container comum
 * (Decision 7 do DESIGN).
 */
export async function coletarDadosVendPago(): Promise<DadosColetados> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const guard = await applyReadOnlyGuard(context, config.erpHost, [LOGIN_PATH_PREFIX], [LISTING_PATH_PATTERN]);

    const page = await context.newPage();
    page.setDefaultTimeout(config.playwrightTimeoutMs);

    try {
      await page.goto(`https://${config.erpHost}/produtos`, { waitUntil: "networkidle" });
      await loginNoVendPagoSeNecessario(page, guard);
      if (!page.url().includes("/produtos")) {
        await page.goto(`https://${config.erpHost}/produtos`, { waitUntil: "networkidle" });
      }
      const linksAposLogin = await extrairLinksDaPagina(page);
      const produtosHtmls = await coletarPaginasProdutos(page);

      const handoff = encontrarLinkHandoffSso(linksAposLogin, config.vendtefHost);
      if (handoff) {
        await page.goto(handoff, { waitUntil: "networkidle" });
      }
      await page.goto(`https://${config.vendtefHost}/terminal/relatorioEstoque/tid/1`, {
        waitUntil: "networkidle",
      });
      // Os percentuais/quantidades do relatório são preenchidos por uma
      // animação de contagem após o carregamento (ver reconhecimento em
      // produção) — sem essa espera a extração pega células ainda vazias.
      await page.waitForTimeout(1500);
      await fecharModalDeNovidadesSeAberto(page);
      const estoqueHtml = await page.content();

      lancarSeBloqueado(guard);
      return { produtosHtmls, estoqueHtml };
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
