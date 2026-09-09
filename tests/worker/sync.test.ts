import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "@/db/migrate";
import { executarSincronizacao } from "@/worker/sync";
import { getUltimoSnapshotOk } from "@/repos/snapshots";
import { WriteAttemptError } from "@/worker/vendpago/readOnlyGuard";

const PRODUTOS_HTML = `
<table><thead><tr><th>Nome</th><th>Situação</th></tr></thead><tbody>
  <tr><td>Coca-Cola(#1)</td><td>Ativo</td></tr>
</tbody></table>`;

const ESTOQUE_HTML = `
<table><thead><tr><th>Seleção</th><th>Produto</th><th>Disponível / Capacidade (unid)</th></tr></thead><tbody>
  <tr><td>A1</td><td>Coca-Cola</td><td>7 / 10</td></tr>
</tbody></table>`;

const DADOS_OK = async () => ({ produtosHtmls: [PRODUTOS_HTML], estoqueHtml: ESTOQUE_HTML });

describe("executarSincronizacao", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await applyMigrations(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AT-005: persiste um novo snapshot 'ok' quando a coleta e o parser funcionam", async () => {
    const snapshot = await executarSincronizacao({ db, coletarDados: DADOS_OK });

    expect(snapshot.status).toBe("ok");
    const ultimo = await getUltimoSnapshotOk(db);
    expect(ultimo?.id).toBe(snapshot.id);
  });

  it("AT-007: falha na sincronização preserva o último snapshot válido e sua data", async () => {
    const ok = await executarSincronizacao({ db, coletarDados: DADOS_OK });

    const falhou = await executarSincronizacao({
      db,
      coletarDados: async () => {
        throw new Error("timeout de navegação");
      },
      sleep: async () => {},
    });

    expect(falhou.status).toBe("falha");
    const ultimoOk = await getUltimoSnapshotOk(db);
    expect(ultimoOk?.id).toBe(ok.id);
    expect(ultimoOk?.criadoEm).toBe(ok.criadoEm);
  });

  it("retenta uma vez com backoff exponencial (fake timers) antes de suceder", async () => {
    vi.useFakeTimers();
    let chamadas = 0;

    const promise = executarSincronizacao({
      db,
      coletarDados: async () => {
        chamadas += 1;
        if (chamadas === 1) throw new Error("timeout de navegação");
        return DADOS_OK();
      },
    });

    await vi.advanceTimersByTimeAsync(1000);
    const snapshot = await promise;

    expect(chamadas).toBe(2);
    expect(snapshot.status).toBe("ok");
  });

  it("não retenta e registra falha imediata quando o guard bloqueia uma tentativa de escrita", async () => {
    const sleep = vi.fn(async () => {});
    let chamadas = 0;

    const snapshot = await executarSincronizacao({
      db,
      coletarDados: async () => {
        chamadas += 1;
        throw new WriteAttemptError("POST", "https://www.erpvending.com.br/x");
      },
      sleep,
    });

    expect(chamadas).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(snapshot.status).toBe("falha");
    expect(snapshot.erro).toMatch(/Tentativa de escrita bloqueada/);
  });

  it("descarta o resultado (não grava snapshot degradado) quando o parser não encontra linhas válidas", async () => {
    const snapshot = await executarSincronizacao({
      db,
      coletarDados: async () => ({ produtosHtmls: [], estoqueHtml: "<html><body>layout mudou</body></html>" }),
      sleep: async () => {},
    });

    expect(snapshot.status).toBe("falha");
    expect(await getUltimoSnapshotOk(db)).toBeNull();
  });
});
