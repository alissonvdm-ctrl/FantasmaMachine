import * as cheerio from "cheerio";
import type { SnapshotItemInput } from "@/domain/types";

/**
 * Estrutura esperada — uma tabela `#tabela-estoque` com uma linha por mola,
 * contendo código da mola, código do produto e quantidade (ver
 * tests/fixtures/vendpago-estoque.html). O HTML real do VendPago ainda não
 * foi capturado (DEFINE, Open Questions); ajustar os seletores após a
 * primeira sincronização real, sem alterar o contrato de saída.
 */
export function parseEstoqueHtml(html: string): SnapshotItemInput[] {
  const $ = cheerio.load(html);
  const itens: SnapshotItemInput[] = [];

  $("#tabela-estoque tbody tr").each((_, row) => {
    const molaCodigo = $(row).find(".mola-codigo").text().trim();
    const produtoCodigo = $(row).find(".produto-codigo").text().trim();
    const quantidadeTexto = $(row).find(".quantidade").text().trim();
    const quantidade = quantidadeTexto === "" ? NaN : Number(quantidadeTexto);

    if (!molaCodigo || !produtoCodigo || !Number.isFinite(quantidade)) {
      return;
    }
    itens.push({ molaCodigo, produtoCodigo, quantidade });
  });

  return itens;
}
