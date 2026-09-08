import { describe, expect, it } from "vitest";
import { gerarRoteiro } from "@/domain/roteiro";
import type { Mola, VisitaItem } from "@/domain/types";

const molas: Mola[] = [
  { id: "m-a10", posicao: "A10", produtoAtualId: "coca", capacidade: 10 },
  { id: "m-a2", posicao: "A2", produtoAtualId: "guarana", capacidade: 10 },
  { id: "m-b1", posicao: "B1", produtoAtualId: "agua", capacidade: 10 },
];

function item(overrides: Partial<VisitaItem>): VisitaItem {
  return {
    visitaId: "v1",
    molaId: "m-a2",
    quantidadeInserida: 0,
    produtoNovoId: null,
    atualizadoEm: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("gerarRoteiro", () => {
  it("AT-001: contém apenas molas alteradas, ordenadas por posição (numérico)", () => {
    const itens: VisitaItem[] = [
      item({ molaId: "m-a10", quantidadeInserida: 3 }),
      item({ molaId: "m-a2", quantidadeInserida: 2 }),
    ];

    const roteiro = gerarRoteiro(itens, molas);

    expect(roteiro.map((linha) => linha.posicao)).toEqual(["A2", "A10"]);
  });

  it("AT-002: identifica troca de produto no roteiro", () => {
    const itens: VisitaItem[] = [item({ molaId: "m-b1", quantidadeInserida: 4, produtoNovoId: "chocolate" })];

    const roteiro = gerarRoteiro(itens, molas);

    expect(roteiro).toEqual([
      { posicao: "B1", produtoCodigo: "chocolate", quantidade: 4, houveTroca: true },
    ]);
  });

  it("AT-008: mola não alterada (quantidade zero e sem troca) é omitida", () => {
    const itens: VisitaItem[] = [
      item({ molaId: "m-a2", quantidadeInserida: 0, produtoNovoId: null }),
      item({ molaId: "m-b1", quantidadeInserida: 5 }),
    ];

    const roteiro = gerarRoteiro(itens, molas);

    expect(roteiro).toHaveLength(1);
    expect(roteiro[0]?.posicao).toBe("B1");
  });

  it("usa o produto atual da mola quando não há troca", () => {
    const itens: VisitaItem[] = [item({ molaId: "m-a2", quantidadeInserida: 6, produtoNovoId: null })];

    const roteiro = gerarRoteiro(itens, molas);

    expect(roteiro[0]?.produtoCodigo).toBe("guarana");
  });

  it("lança erro se o item referenciar mola ausente do planograma", () => {
    const itens: VisitaItem[] = [item({ molaId: "inexistente", quantidadeInserida: 1 })];

    expect(() => gerarRoteiro(itens, molas)).toThrow(/Mola ausente no planograma/);
  });
});
