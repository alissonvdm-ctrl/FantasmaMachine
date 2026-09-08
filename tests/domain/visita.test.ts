import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/db/migrate";
import {
  abrirVisita,
  fecharVisita,
  garantirAberta,
  ItemInvalidoError,
  marcarDigitada,
  TransicaoInvalidaError,
  validarItem,
  VisitaEstadoError,
} from "@/domain/visita";
import { criarVisita, getVisita, listItensDaVisita, upsertItem } from "@/repos/visitas";
import type { Mola } from "@/domain/types";

describe("máquina de estados da visita", () => {
  it("abre uma visita no estado 'aberta'", () => {
    const visita = abrirVisita("v1", "d1", "2026-09-08T10:00:00.000Z");
    expect(visita.status).toBe("aberta");
    expect(() => garantirAberta(visita)).not.toThrow();
  });

  it("fecha uma visita aberta e rejeita fechar de novo", () => {
    const aberta = abrirVisita("v1", "d1", "2026-09-08T10:00:00.000Z");
    const fechada = fecharVisita(aberta, "2026-09-08T10:05:00.000Z");
    expect(fechada.status).toBe("fechada");
    expect(fechada.fechadaEm).toBe("2026-09-08T10:05:00.000Z");

    expect(() => fecharVisita(fechada, "2026-09-08T10:06:00.000Z")).toThrow(TransicaoInvalidaError);
  });

  it("marca como digitada apenas a partir de 'fechada'", () => {
    const aberta = abrirVisita("v1", "d1", "2026-09-08T10:00:00.000Z");
    expect(() => marcarDigitada(aberta, "2026-09-08T10:10:00.000Z")).toThrow(TransicaoInvalidaError);

    const fechada = fecharVisita(aberta, "2026-09-08T10:05:00.000Z");
    const digitada = marcarDigitada(fechada, "2026-09-08T11:00:00.000Z");
    expect(digitada.status).toBe("digitada");
  });

  it("rejeita registrar item em visita não aberta", () => {
    const fechada = fecharVisita(abrirVisita("v1", "d1", "t0"), "t1");
    expect(() => garantirAberta(fechada)).toThrow(VisitaEstadoError);
  });
});

describe("validarItem", () => {
  const mola: Mola = { id: "A1", posicao: "A1", produtoAtualId: "coca", capacidade: 10 };
  const produtosAtivos = new Set(["coca", "guarana"]);

  it("aceita quantidade dentro da capacidade", () => {
    expect(() =>
      validarItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 5, produtoNovoId: null }, mola, produtosAtivos),
    ).not.toThrow();
  });

  it("rejeita quantidade negativa", () => {
    expect(() =>
      validarItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: -1, produtoNovoId: null }, mola, produtosAtivos),
    ).toThrow(ItemInvalidoError);
  });

  it("rejeita quantidade acima da capacidade e menciona a capacidade na mensagem", () => {
    expect(() =>
      validarItem({ visitaId: "v1", molaId: "A1", quantidadeInserida: 11, produtoNovoId: null }, mola, produtosAtivos),
    ).toThrow(/10/);
  });

  it("rejeita produto fora da lista fixa", () => {
    expect(() =>
      validarItem(
        { visitaId: "v1", molaId: "A1", quantidadeInserida: 1, produtoNovoId: "inexistente" },
        mola,
        produtosAtivos,
      ),
    ).toThrow(ItemInvalidoError);
  });
});

describe("upsertItem — idempotência (repo)", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await applyMigrations(db);
    await db.execute("INSERT INTO produtos (id, nome, ativo) VALUES ('coca', 'Coca-Cola', 1)");
    await db.execute("INSERT INTO produtos (id, nome, ativo) VALUES ('guarana', 'Guaraná', 1)");
    await db.execute(
      "INSERT INTO molas (id, posicao, produto_atual_id, capacidade) VALUES ('A1', 'A1', 'coca', 10)",
    );
    await db.execute(
      "INSERT INTO dispositivos (id, nome, token_hash, ativo, criado_em) VALUES ('d1', 'Celular', 'hash', 1, 't0')",
    );
    await criarVisita(db, {
      id: "v1",
      dispositivoId: "d1",
      status: "aberta",
      abertaEm: "t0",
      fechadaEm: null,
      digitadaEm: null,
    });
  });

  it("reenvio do mesmo item resulta no mesmo estado final (buffer offline, AT-009)", async () => {
    await upsertItem(db, { visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null });
    await upsertItem(db, { visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null });

    const itens = await listItensDaVisita(db, "v1");
    expect(itens).toHaveLength(1);
    expect(itens[0]?.quantidadeInserida).toBe(3);
  });

  it("um novo upsert sobrescreve o valor anterior para a mesma mola", async () => {
    await upsertItem(db, { visitaId: "v1", molaId: "A1", quantidadeInserida: 3, produtoNovoId: null });
    await upsertItem(db, { visitaId: "v1", molaId: "A1", quantidadeInserida: 7, produtoNovoId: "guarana" });

    const itens = await listItensDaVisita(db, "v1");
    expect(itens).toHaveLength(1);
    expect(itens[0]?.quantidadeInserida).toBe(7);
    expect(itens[0]?.produtoNovoId).toBe("guarana");
  });

  it("getVisita devolve a visita recém-criada", async () => {
    const visita = await getVisita(db, "v1");
    expect(visita?.status).toBe("aberta");
  });
});
