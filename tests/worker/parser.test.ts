import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEstoqueHtml } from "@/worker/vendpago/parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "..", "fixtures", "vendpago-estoque.html");

describe("parseEstoqueHtml", () => {
  it("extrai mola, produto e quantidade das linhas válidas", () => {
    const html = readFileSync(fixturePath, "utf8");
    const itens = parseEstoqueHtml(html);

    expect(itens).toEqual([
      { molaCodigo: "A1", produtoCodigo: "COCA350", quantidade: 8 },
      { molaCodigo: "A2", produtoCodigo: "GUARANA350", quantidade: 5 },
      { molaCodigo: "B1", produtoCodigo: "AGUA500", quantidade: 0 },
    ]);
  });

  it("ignora linhas malformadas (quantidade ausente)", () => {
    const html = readFileSync(fixturePath, "utf8");
    const itens = parseEstoqueHtml(html);
    expect(itens.find((item) => item.molaCodigo === "B2")).toBeUndefined();
  });

  it("devolve lista vazia quando a estrutura esperada não existe (layout mudou)", () => {
    const itens = parseEstoqueHtml("<html><body>layout mudou</body></html>");
    expect(itens).toEqual([]);
  });
});
