import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { secretsMatch } from "@/lib/crypto";
import { applyReadOnlyGuard } from "@/worker/vendpago/readOnlyGuard";
import {
  launchBrowser,
  loginNoVendPagoSeNecessario,
  encontrarLinkHandoffSso,
  LOGIN_PATH_PREFIX,
  LISTING_PATH_PATTERN,
} from "@/worker/vendpago/scraper";

const ALLOWED_HOSTS = new Set(["www.erpvending.com.br", "www.portalvendtef.com.br"]);

interface FormInfo {
  action: string;
  method: string;
  inputs: Array<{ tag: string; type: string | null; name: string | null; id: string | null }>;
}

/**
 * Endpoint de diagnóstico temporário (não faz parte do File Manifest original):
 * loga no VendPago (se a página pedir) e navega até uma URL do
 * erpvending.com.br ou portalvendtef.com.br, devolvendo formulários e tabelas
 * encontrados em JSON. Necessário porque o parser real e o scraper foram
 * escritos sem nunca ter visto o HTML de produção. Removido depois do
 * reconhecimento.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret") ?? "";
  if (!secretsMatch(secret, config.cronSecret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const targetUrl = request.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Parâmetro url ausente" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return NextResponse.json({ error: "Host não permitido: " + parsed.host }, { status: 400 });
  }

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const guard = await applyReadOnlyGuard(context, parsed.host, [LOGIN_PATH_PREFIX], [LISTING_PATH_PATTERN]);
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    const extrairLinks = (): Promise<Array<{ text: string; href: string }>> =>
      page.$$eval("a[href]", (anchors) =>
        anchors
          .map((a) => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href") ?? "" }))
          .filter((l) => l.href && l.href !== "#"),
      );

    await page.goto(parsed.toString(), { waitUntil: "networkidle" });
    await loginNoVendPagoSeNecessario(page, guard);
    const urlAposLogin = page.url();
    // Links da página logo após o login, antes de qualquer re-navegação — é aqui
    // que aparece a navegação real (abas ERP/VendTEF/PayBlu), útil para achar o
    // link de handoff de SSO quando o destino é um domínio diferente do login.
    const linksAposLogin = await extrairLinks();

    // Se o destino é um domínio diferente do host onde o login aconteceu, a
    // sessão não é compartilhada automaticamente — é preciso passar pelo link
    // de handoff de SSO (aba ERP/VendTEF/PayBlu) antes da URL de destino real.
    let handoffUsado: string | null = null;
    if (new URL(urlAposLogin).host !== parsed.host) {
      handoffUsado = encontrarLinkHandoffSso(linksAposLogin, parsed.host);
      if (handoffUsado) {
        await page.goto(handoffUsado, { waitUntil: "networkidle" });
      }
      await page.goto(parsed.toString(), { waitUntil: "networkidle" });
    }

    const finalUrl = page.url();
    const title = await page.title();
    const bloqueado = guard.getBlockedAttempt();

    const forms: FormInfo[] = await page.$$eval("form", (elements) =>
      elements.map((form) => ({
        action: form.getAttribute("action") ?? "",
        method: form.getAttribute("method") ?? "get",
        inputs: Array.from(form.querySelectorAll("input, select, button")).map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          id: el.getAttribute("id"),
        })),
      })),
    );

    // Alguns controles (ex.: seletor de itens por página do DataTables) ficam
    // fora de qualquer <form> — capturados à parte para achar a paginação.
    const selects: Array<{ id: string | null; name: string | null; options: string[] }> = await page.$$eval(
      "select",
      (elements) =>
        elements.map((select) => ({
          id: select.getAttribute("id"),
          name: select.getAttribute("name"),
          options: Array.from(select.querySelectorAll("option")).map((o) => (o.textContent ?? "").trim()),
        })),
    );

    // Algumas colunas (ex.: percentuais no relatório de estoque da máquina) são
    // preenchidas por uma animação de contagem após o carregamento — sem essa
    // espera, a extração pega os valores ainda zerados/vazios.
    await page.waitForTimeout(1500);

    const tables: string[][][] = await page.$$eval("table", (tableElements) =>
      tableElements.map((table) =>
        Array.from(table.querySelectorAll("tr")).map((row) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) => (cell.textContent ?? "").trim()),
        ),
      ),
    );

    const links = await extrairLinks();

    const bodyTextSnippet = (await page.innerText("body")).slice(0, 6000);

    return NextResponse.json(
      {
        requestedUrl: parsed.toString(),
        urlAposLogin,
        linksAposLogin,
        handoffUsado,
        finalUrl,
        title,
        pareceLogin: finalUrl.includes(LOGIN_PATH_PREFIX),
        tentativaDeEscritaBloqueada: bloqueado,
        forms,
        selects,
        tables,
        links,
        bodyTextSnippet,
      },
      { status: 200 },
    );
  } finally {
    await browser.close();
  }
}
