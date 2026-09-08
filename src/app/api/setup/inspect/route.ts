import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";
import { config } from "@/lib/config";
import { secretsMatch } from "@/lib/crypto";

const ALLOWED_HOSTS = new Set(["www.erpvending.com.br", "www.portalvendtef.com.br"]);

interface FormInfo {
  action: string;
  method: string;
  inputs: Array<{ tag: string; type: string | null; name: string | null; id: string | null }>;
}

/**
 * Endpoint de diagnóstico temporário (não faz parte do File Manifest original):
 * navega (somente GET, sem login) até uma URL do VendPago/VendTEF e devolve a
 * estrutura da página (formulários e tabelas) para permitir escrever o parser
 * real sem nunca ter visto o HTML de produção. Removido depois do reconhecimento.
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

  const browser = await chromium.launch({
    args: sparticuzChromium.args,
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    await page.goto(parsed.toString(), { waitUntil: "networkidle" });

    const finalUrl = page.url();
    const title = await page.title();

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

    const tables: string[][][] = await page.$$eval("table", (tableElements) =>
      tableElements.map((table) =>
        Array.from(table.querySelectorAll("tr")).map((row) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) => (cell.textContent ?? "").trim()),
        ),
      ),
    );

    const bodyTextSnippet = (await page.innerText("body")).slice(0, 4000);

    return NextResponse.json(
      {
        requestedUrl: parsed.toString(),
        finalUrl,
        title,
        pareceLogin: /login|senha|password/i.test(finalUrl) || /login|senha/i.test(title),
        forms,
        tables,
        bodyTextSnippet,
      },
      { status: 200 },
    );
  } finally {
    await browser.close();
  }
}
