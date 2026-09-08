import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueueItem, flushPendingItems, listPendingItems, removeItem } from "@/lib/offlineBuffer";

describe("offlineBuffer (AT-009)", () => {
  beforeEach(async () => {
    const pendentes = await listPendingItems();
    for (const item of pendentes) {
      await removeItem(item.visitaId, item.molaId);
    }
  });

  it("preserva um item registrado localmente quando a conexão cai", async () => {
    await enqueueItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null });

    const pendentes = await listPendingItems();
    expect(pendentes).toEqual([{ visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null }]);
  });

  it("reenvia a fila ao restabelecer a conexão e remove os itens confirmados", async () => {
    await enqueueItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null });
    await enqueueItem({ visitaId: "v1", molaId: "A2", quantidadeInserida: 1, produtoNovoId: "chocolate" });

    const enviados: string[] = [];
    const resultado = await flushPendingItems(async (item) => {
      enviados.push(item.molaId);
      return true;
    });

    expect(resultado).toEqual({ enviados: 2, restantes: 0 });
    expect(enviados.sort()).toEqual(["A1", "A2"]);
    expect(await listPendingItems()).toEqual([]);
  });

  it("mantém na fila os itens cujo reenvio falhou", async () => {
    await enqueueItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 2, produtoNovoId: null });
    await enqueueItem({ visitaId: "v1", molaId: "A2", quantidadeInserida: 5, produtoNovoId: null });

    const resultado = await flushPendingItems(async (item) => item.molaId === "A1");

    expect(resultado).toEqual({ enviados: 1, restantes: 1 });
    const restantes = await listPendingItems();
    expect(restantes).toEqual([{ visitaId: "v1", molaId: "A2", quantidadeInserida: 5, produtoNovoId: null }]);
  });

  it("um novo enqueue para a mesma mola substitui o item pendente anterior", async () => {
    await enqueueItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 1, produtoNovoId: null });
    await enqueueItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 9, produtoNovoId: "chocolate" });

    const pendentes = await listPendingItems();
    expect(pendentes).toEqual([
      { visitaId: "v1", molaId: "A1", quantidadeInserida: 9, produtoNovoId: "chocolate" },
    ]);
  });
});
