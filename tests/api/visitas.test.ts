import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import { hashToken } from "@/lib/crypto";
import { createAdminSessionValue } from "@/lib/auth";
import { POST as abrirVisitaRoute } from "@/app/api/visitas/route";
import { POST as registrarItemRoute } from "@/app/api/visitas/[id]/itens/route";
import { POST as fecharVisitaRoute } from "@/app/api/visitas/[id]/fechar/route";
import { POST as marcarDigitadaRoute } from "@/app/api/visitas/[id]/digitada/route";
import { GET as estoqueRoute } from "@/app/api/estoque/route";

const TOKEN = "token-de-teste-abastecedor";
const TOKEN_HASH = hashToken(TOKEN);
const DISPOSITIVO_ID = "disp-1";

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

beforeAll(() => {
  const db = getDb();
  applyMigrations(db);
  db.prepare("INSERT INTO produtos (id, nome, ativo) VALUES ('coca', 'Coca-Cola', 1)").run();
  db.prepare("INSERT INTO produtos (id, nome, ativo) VALUES ('guarana', 'Guaraná', 1)").run();
  db.prepare(
    "INSERT INTO molas (id, posicao, produto_atual_id, capacidade) VALUES ('A1', 'A1', 'coca', 10)",
  ).run();
  db.prepare(
    "INSERT INTO dispositivos (id, nome, token_hash, ativo, criado_em) VALUES (?, 'Celular de teste', ?, 1, ?)",
  ).run(DISPOSITIVO_ID, TOKEN_HASH, new Date().toISOString());
});

describe("POST /api/visitas — autorização por token", () => {
  it("rejeita sem token de dispositivo (401)", async () => {
    const res = await abrirVisitaRoute(req("/api/visitas", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("rejeita token inválido (401)", async () => {
    const res = await abrirVisitaRoute(
      req("/api/visitas", { method: "POST", headers: { "x-device-token": "token-errado" } }),
    );
    expect(res.status).toBe(401);
  });

  it("abre uma visita com token válido (201)", async () => {
    const res = await abrirVisitaRoute(
      req("/api/visitas", { method: "POST", headers: { "x-device-token": TOKEN } }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.visita.status).toBe("aberta");
    expect(body.molas).toHaveLength(1);
  });
});

describe("ciclo completo de uma visita", () => {
  let visitaId: string;

  it("abre a visita", async () => {
    const res = await abrirVisitaRoute(
      req("/api/visitas", { method: "POST", headers: { "x-device-token": TOKEN } }),
    );
    const body = await res.json();
    visitaId = body.visita.id;
    expect(visitaId).toBeTruthy();
  });

  it("registra um item com quantidade válida (200)", async () => {
    const res = await registrarItemRoute(
      req(`/api/visitas/${visitaId}/itens`, {
        method: "POST",
        headers: { "x-device-token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ molaId: "A1", quantidadeInserida: 5, produtoNovoId: null }),
      }),
      { params: { id: visitaId } },
    );
    expect(res.status).toBe(200);
  });

  it("rejeita quantidade acima da capacidade (422)", async () => {
    const res = await registrarItemRoute(
      req(`/api/visitas/${visitaId}/itens`, {
        method: "POST",
        headers: { "x-device-token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ molaId: "A1", quantidadeInserida: 999, produtoNovoId: null }),
      }),
      { params: { id: visitaId } },
    );
    expect(res.status).toBe(422);
  });

  it("registro idempotente: reenviar o mesmo item não duplica (AT-009)", async () => {
    const payload = { molaId: "A1", quantidadeInserida: 5, produtoNovoId: null };
    for (let i = 0; i < 2; i += 1) {
      const res = await registrarItemRoute(
        req(`/api/visitas/${visitaId}/itens`, {
          method: "POST",
          headers: { "x-device-token": TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        { params: { id: visitaId } },
      );
      expect(res.status).toBe(200);
    }
  });

  it("fecha a visita e recebe o roteiro (AT-001)", async () => {
    const res = await fecharVisitaRoute(
      req(`/api/visitas/${visitaId}/fechar`, { method: "POST", headers: { "x-device-token": TOKEN } }),
      { params: { id: visitaId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visita.status).toBe("fechada");
    expect(body.roteiro).toEqual([
      { posicao: "A1", produtoCodigo: "coca", quantidade: 5, houveTroca: false },
    ]);
  });

  it("rejeita novo item após o fechamento (409)", async () => {
    const res = await registrarItemRoute(
      req(`/api/visitas/${visitaId}/itens`, {
        method: "POST",
        headers: { "x-device-token": TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ molaId: "A1", quantidadeInserida: 1, produtoNovoId: null }),
      }),
      { params: { id: visitaId } },
    );
    expect(res.status).toBe(409);
  });

  it("marcar como digitada exige sessão admin (401 sem cookie)", async () => {
    const res = await marcarDigitadaRoute(req(`/api/visitas/${visitaId}/digitada`, { method: "POST" }), {
      params: { id: visitaId },
    });
    expect(res.status).toBe(401);
  });

  it("marca como digitada com sessão admin válida (200)", async () => {
    const sessionValue = createAdminSessionValue();
    const res = await marcarDigitadaRoute(
      req(`/api/visitas/${visitaId}/digitada`, {
        method: "POST",
        headers: { Cookie: `admin_session=${sessionValue}` },
      }),
      { params: { id: visitaId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visita.status).toBe("digitada");
  });
});

describe("GET /api/estoque — sessão admin", () => {
  it("exige sessão admin (401)", async () => {
    const res = await estoqueRoute(req("/api/estoque"));
    expect(res.status).toBe(401);
  });

  it("devolve a visão de estoque com sessão admin válida (200)", async () => {
    const sessionValue = createAdminSessionValue();
    const res = await estoqueRoute(req("/api/estoque", { headers: { Cookie: `admin_session=${sessionValue}` } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.linhas)).toBe(true);
  });
});

describe("token não acessa visita de outro dispositivo", () => {
  it("token de outro dispositivo recebe 404 ao tentar registrar item", async () => {
    const outroHash = hashToken("outro-token");
    const db = getDb();
    db.prepare(
      "INSERT INTO dispositivos (id, nome, token_hash, ativo, criado_em) VALUES ('disp-2', 'Outro celular', ?, 1, ?)",
    ).run(outroHash, new Date().toISOString());

    const abertura = await abrirVisitaRoute(
      req("/api/visitas", { method: "POST", headers: { "x-device-token": TOKEN } }),
    );
    const { visita } = await abertura.json();

    const res = await registrarItemRoute(
      req(`/api/visitas/${visita.id}/itens`, {
        method: "POST",
        headers: { "x-device-token": "outro-token", "Content-Type": "application/json" },
        body: JSON.stringify({ molaId: "A1", quantidadeInserida: 1, produtoNovoId: null }),
      }),
      { params: { id: visita.id } },
    );
    expect(res.status).toBe(404);
  });

  it("dispositivo revogado recebe 401 ao tentar abrir visita", async () => {
    const db = getDb();
    db.prepare("UPDATE dispositivos SET ativo = 0 WHERE id = ?").run(DISPOSITIVO_ID);

    const res = await abrirVisitaRoute(
      req("/api/visitas", { method: "POST", headers: { "x-device-token": TOKEN } }),
    );
    expect(res.status).toBe(401);

    db.prepare("UPDATE dispositivos SET ativo = 1 WHERE id = ?").run(DISPOSITIVO_ID);
  });
});
