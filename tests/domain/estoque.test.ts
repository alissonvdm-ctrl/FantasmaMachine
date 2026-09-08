import { describe, expect, it } from "vitest";
import { montarVisaoEstoque } from "@/domain/estoque";
import type { Mola, SnapshotItem, VisitaItem } from "@/domain/types";

const molas: Mola[] = [
  { id: "A1", posicao: "A1", produtoAtualId: "coca", capacidade: 10 },
  { id: "A2", posicao: "A2", produtoAtualId: "guarana", capacidade: 10 },
];

describe("montarVisaoEstoque (AT-003)", () => {
  it("exibe a quantidade lida do VendPago e a pendência de visitas fechadas não digitadas, por mola", () => {
    const snapshotItens: SnapshotItem[] = [
      { snapshotId: "s1", molaCodigo: "A1", produtoCodigo: "coca", quantidade: 8 },
    ];
    const itensPendentes: VisitaItem[] = [
      {
        visitaId: "v1",
        molaId: "A1",
        quantidadeInserida: 3,
        produtoNovoId: null,
        atualizadoEm: "2026-09-08T10:00:00.000Z",
      },
    ];

    const view = montarVisaoEstoque(molas, snapshotItens, itensPendentes, "2026-09-08T07:00:00.000Z");

    expect(view.ultimaSincronizacaoOk).toBe("2026-09-08T07:00:00.000Z");
    expect(view.linhas).toEqual([
      {
        molaId: "A1",
        posicao: "A1",
        produtoCodigoSnapshot: "coca",
        quantidadeSnapshot: 8,
        quantidadePendente: 3,
        houveTrocaPendente: false,
      },
      {
        molaId: "A2",
        posicao: "A2",
        produtoCodigoSnapshot: null,
        quantidadeSnapshot: null,
        quantidadePendente: 0,
        houveTrocaPendente: false,
      },
    ]);
  });

  it("soma múltiplas visitas pendentes para a mesma mola e sinaliza troca pendente", () => {
    const itensPendentes: VisitaItem[] = [
      { visitaId: "v1", molaId: "A2", quantidadeInserida: 2, produtoNovoId: null, atualizadoEm: "t1" },
      { visitaId: "v2", molaId: "A2", quantidadeInserida: 4, produtoNovoId: "chocolate", atualizadoEm: "t2" },
    ];

    const view = montarVisaoEstoque(molas, [], itensPendentes, null);

    const linhaA2 = view.linhas.find((linha) => linha.molaId === "A2");
    expect(linhaA2?.quantidadePendente).toBe(6);
    expect(linhaA2?.houveTrocaPendente).toBe(true);
    expect(view.ultimaSincronizacaoOk).toBeNull();
  });
});
