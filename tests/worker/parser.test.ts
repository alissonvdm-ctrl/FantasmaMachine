import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEstoqueHtml, parseProdutosHtml } from "@/worker/vendpago/parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");
const estoqueHtml = readFileSync(join(fixturesDir, "vendpago-estoque.html"), "utf8");
const produtosHtml = readFileSync(join(fixturesDir, "vendpago-produtos.html"), "utf8");

describe("parseProdutosHtml", () => {
  it("extrai código (embutido no nome) e situação das linhas válidas", () => {
    const produtos = parseProdutosHtml(produtosHtml);

    expect(produtos).toEqual([
      { codigo: "101", nome: "Coca-Cola 350ml", ativo: true },
      { codigo: "102", nome: "Guaraná 350ml", ativo: true },
      { codigo: "103", nome: "Água 500ml", ativo: false },
    ]);
  });

  it("ignora linhas sem código embutido no nome", () => {
    const produtos = parseProdutosHtml(produtosHtml);
    expect(produtos.find((p) => p.nome === "Produto sem código")).toBeUndefined();
  });

  it("devolve lista vazia quando a tabela esperada não existe (layout mudou)", () => {
    expect(parseProdutosHtml("<html><body>layout mudou</body></html>")).toEqual([]);
  });
});

describe("parseEstoqueHtml", () => {
  const mapa = new Map([
    ["Coca-Cola 350ml", "101"],
    ["Guaraná 350ml", "102"],
    ["Água 500ml", "103"],
  ]);

  it("extrai mola, produto (resolvido pelo nome) e quantidade disponível das linhas válidas", () => {
    const itens = parseEstoqueHtml(estoqueHtml, mapa);

    expect(itens).toEqual([
      { molaCodigo: "A1", produtoCodigo: "101", quantidade: 7 },
      { molaCodigo: "A2", produtoCodigo: "102", quantidade: 5 },
      { molaCodigo: "B1", produtoCodigo: "103", quantidade: 0 },
    ]);
  });

  it("ignora linhas malformadas (quantidade ausente)", () => {
    const itens = parseEstoqueHtml(estoqueHtml, mapa);
    expect(itens.find((item) => item.molaCodigo === "B2")).toBeUndefined();
  });

  it("ignora linhas cujo produto não está no mapa nome→código", () => {
    const itens = parseEstoqueHtml(estoqueHtml, mapa);
    expect(itens.find((item) => item.molaCodigo === "B3")).toBeUndefined();
  });

  it("ignora linhas com disponível negativo (anomalia do VendPago, não estado válido de estoque)", () => {
    const itens = parseEstoqueHtml(estoqueHtml, mapa);
    expect(itens.find((item) => item.molaCodigo === "B4")).toBeUndefined();
  });

  it("devolve lista vazia quando a estrutura esperada não existe (layout mudou)", () => {
    const itens = parseEstoqueHtml("<html><body>layout mudou</body></html>", mapa);
    expect(itens).toEqual([]);
  });
});
