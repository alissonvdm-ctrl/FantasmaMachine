import type {
  EstoqueLinha,
  EstoqueView,
  Mola,
  SnapshotItem,
  VisitaItem,
} from "@/domain/types";

/**
 * Cruza o último snapshot válido do VendPago com os itens de visitas fechadas
 * ainda não digitadas (AT-003). Não depende do robô estar disponível: se não
 * houver snapshot, a coluna de leitura fica nula e a pendência continua visível.
 */
export function montarVisaoEstoque(
  molas: readonly Mola[],
  snapshotItens: readonly SnapshotItem[],
  itensPendentes: readonly VisitaItem[],
  ultimaSincronizacaoOk: string | null,
): EstoqueView {
  const snapshotPorMola = new Map(snapshotItens.map((item) => [item.molaCodigo, item]));

  const pendentePorMola = new Map<string, { quantidade: number; houveTroca: boolean }>();
  for (const item of itensPendentes) {
    const atual = pendentePorMola.get(item.molaId) ?? { quantidade: 0, houveTroca: false };
    pendentePorMola.set(item.molaId, {
      quantidade: atual.quantidade + item.quantidadeInserida,
      houveTroca: atual.houveTroca || item.produtoNovoId !== null,
    });
  }

  const linhas: EstoqueLinha[] = molas.map((mola) => {
    const snapshot = snapshotPorMola.get(mola.id);
    const pendente = pendentePorMola.get(mola.id);
    return {
      molaId: mola.id,
      posicao: mola.posicao,
      produtoCodigoSnapshot: snapshot?.produtoCodigo ?? null,
      quantidadeSnapshot: snapshot?.quantidade ?? null,
      quantidadePendente: pendente?.quantidade ?? 0,
      houveTrocaPendente: pendente?.houveTroca ?? false,
    };
  });

  return { linhas, ultimaSincronizacaoOk };
}
