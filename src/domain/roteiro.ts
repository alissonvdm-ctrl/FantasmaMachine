import type { Mola, RoteiroLinha, VisitaItem } from "@/domain/types";

const ordenacaoNumerica: Intl.CollatorOptions = {
  numeric: true,
};

/**
 * Roteiro é gerado a partir do diff registrado na visita, nunca do snapshot do
 * VendPago (Decision 5 do DESIGN) — precisa funcionar mesmo com o robô fora do ar.
 */
export function gerarRoteiro(
  itens: readonly VisitaItem[],
  molas: readonly Mola[],
): RoteiroLinha[] {
  const porPosicao = new Map(molas.map((m) => [m.id, m]));

  return itens
    .filter((item) => item.quantidadeInserida > 0 || item.produtoNovoId !== null)
    .map((item) => {
      const mola = porPosicao.get(item.molaId);
      if (!mola) throw new Error("Mola ausente no planograma: " + item.molaId);
      return {
        posicao: mola.posicao,
        produtoCodigo: item.produtoNovoId ?? mola.produtoAtualId,
        quantidade: item.quantidadeInserida,
        houveTroca: item.produtoNovoId !== null,
      };
    })
    .sort((a, b) => a.posicao.localeCompare(b.posicao, "pt-BR", ordenacaoNumerica));
}
