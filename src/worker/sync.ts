import { randomUUID } from "node:crypto";
import type { DbHandle } from "@/db/client";
import { salvarSnapshot } from "@/repos/snapshots";
import { coletarDadosVendPago, type DadosColetados } from "@/worker/vendpago/scraper";
import { parseEstoqueHtml, parseProdutosHtml } from "@/worker/vendpago/parser";
import { WriteAttemptError } from "@/worker/vendpago/readOnlyGuard";
import { logger } from "@/lib/logger";
import type { Snapshot, SnapshotItem } from "@/domain/types";

const TENTATIVAS = 2;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retenta login/timeout até TENTATIVAS vezes com backoff exponencial (ver
 * Integration Points do DESIGN). Uma tentativa de escrita bloqueada nunca é
 * retentada — é um erro definitivo de segurança, não uma falha transitória.
 */
async function coletarComRetry(
  coletarDados: () => Promise<DadosColetados>,
  sleep: (ms: number) => Promise<void>,
): Promise<DadosColetados> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await coletarDados();
    } catch (err) {
      if (err instanceof WriteAttemptError) throw err;
      ultimoErro = err;
      if (tentativa < TENTATIVAS - 1) {
        logger.warn("sync.retry", { tentativa: tentativa + 1 });
        await sleep(1000 * 2 ** tentativa);
      }
    }
  }
  throw ultimoErro;
}

export interface SincronizacaoDeps {
  db: DbHandle;
  coletarDados?: () => Promise<DadosColetados>;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Uma falha nunca descarta o último snapshot `ok`: getUltimoSnapshotOk só
 * enxerga linhas com status='ok', então gravar um snapshot 'falha' aqui é
 * apenas trilha de auditoria (AT-007), não afeta a leitura corrente.
 */
export async function executarSincronizacao(deps: SincronizacaoDeps): Promise<Snapshot> {
  const coletarDados = deps.coletarDados ?? coletarDadosVendPago;
  const sleep = deps.sleep ?? esperar;
  const id = randomUUID();
  const criadoEm = new Date().toISOString();

  try {
    const dados = await coletarComRetry(coletarDados, sleep);
    const produtos = dados.produtosHtmls.flatMap(parseProdutosHtml);
    const mapaNomeParaCodigo = new Map(produtos.map((p) => [p.nome, p.codigo]));
    const linhas = parseEstoqueHtml(dados.estoqueHtml, mapaNomeParaCodigo);
    if (linhas.length === 0) {
      throw new Error("Parser não encontrou nenhuma linha de estoque válida");
    }

    const itens: SnapshotItem[] = linhas.map((linha) => ({ ...linha, snapshotId: id }));
    const snapshot: Snapshot = { id, status: "ok", criadoEm, erro: null };
    await salvarSnapshot(deps.db, snapshot, itens);
    logger.info("sync.ok", { snapshotId: id, itens: itens.length });
    return snapshot;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    const snapshot: Snapshot = { id, status: "falha", criadoEm, erro: mensagem };
    await salvarSnapshot(deps.db, snapshot, []);

    if (err instanceof WriteAttemptError) {
      logger.error("erp.escrita.bloqueada", { snapshotId: id, erro: mensagem });
    } else {
      logger.error("sync.falha", { snapshotId: id, erro: mensagem });
    }
    return snapshot;
  }
}
