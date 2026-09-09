import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { SnapshotItemInput } from "@/domain/types";

/**
 * Tabelas identificadas pelo texto do cabeçalho, não por id/classe: o VendPago
 * não expõe ids estáveis nas tabelas em si (só em alguns controles avulsos,
 * ex.: paginação), e o mesmo layout de cabeçalho já mudou o verbo do endpoint
 * AJAX por trás mais de uma vez (ver Decision 2, amendments). Casar pelo
 * cabeçalho é mais resiliente a esses detalhes de implementação do que um
 * seletor CSS.
 */
function encontrarTabelaPorCabecalhos($: CheerioAPI, cabecalhosEsperados: readonly string[]): Cheerio<AnyNode> | null {
  let encontrada: Cheerio<AnyNode> | null = null;
  $("table").each((_, table) => {
    const cabecalhos = extrairCabecalhos($, $(table));
    const bate = cabecalhosEsperados.every((esperado) => cabecalhos.some((c) => c.includes(esperado)));
    if (bate) encontrada = $(table);
  });
  return encontrada;
}

function extrairCabecalhos($: CheerioAPI, table: Cheerio<AnyNode>): string[] {
  const emThead = table.find("thead th");
  if (emThead.length > 0) return emThead.map((_, el) => $(el).text().trim()).get();
  return table
    .find("tr")
    .first()
    .find("th, td")
    .map((_, el) => $(el).text().trim())
    .get();
}

function extrairLinhasDeDados($: CheerioAPI, table: Cheerio<AnyNode>): Cheerio<AnyNode>[] {
  const emTbody = table.find("tbody tr");
  if (emTbody.length > 0) return emTbody.toArray().map((el) => $(el));
  return table.find("tr").slice(1).toArray().map((el) => $(el));
}

function indiceDaColuna(cabecalhos: readonly string[], nomeEsperado: string): number {
  return cabecalhos.findIndex((c) => c.includes(nomeEsperado));
}

const PADRAO_CODIGO_NO_NOME = /\(#(\w+)\)\s*$/;
/** Ícones do Material Icons renderizados como texto real (ligature) em células com indicador visual (ex.: nível de estoque). */
const PALAVRAS_DE_ICONE = /\b(check_circle|warning|error|info)\b/g;

/**
 * O código do produto (mesmo id usado em `/produtos/edit/pid/<id>`) vem
 * embutido no fim do texto do nome, ex.: "Acessórios - Shield Basico(#14)".
 * Algumas telas (estoque interno) prefixam a célula com um ícone cujo texto
 * literal ("check_circle", "warning") precisa ser removido antes de extrair.
 */
function extrairCodigoDoNome(textoCompleto: string): { nome: string; codigo: string } | null {
  const semIcones = textoCompleto.replace(PALAVRAS_DE_ICONE, " ").replace(/\s+/g, " ").trim();
  const match = semIcones.match(PADRAO_CODIGO_NO_NOME);
  const codigo = match?.[1];
  if (!match || codigo === undefined) return null;
  return { codigo, nome: semIcones.slice(0, match.index ?? 0).trim() };
}

export interface ProdutoParseado {
  codigo: string;
  nome: string;
  ativo: boolean;
}

const CABECALHOS_PRODUTOS = ["Nome", "Situação"] as const;

/**
 * Tabela de `/produtos` (paginada — chamar uma vez por página e concatenar,
 * ver `coletarPaginasProdutos` em scraper.ts). Usada para resolver o nome do
 * produto exibido no relatório de estoque da máquina para o código real.
 */
export function parseProdutosHtml(html: string): ProdutoParseado[] {
  const $ = cheerio.load(html);
  const tabela = encontrarTabelaPorCabecalhos($, CABECALHOS_PRODUTOS);
  if (!tabela) return [];

  const cabecalhos = extrairCabecalhos($, tabela);
  const idxNome = indiceDaColuna(cabecalhos, "Nome");
  const idxSituacao = indiceDaColuna(cabecalhos, "Situação");

  const produtos: ProdutoParseado[] = [];
  for (const linha of extrairLinhasDeDados($, tabela)) {
    const celulas = linha
      .find("td")
      .map((_, el) => $(el).text().trim())
      .get();
    const celulaNome = celulas[idxNome];
    if (celulaNome === undefined) continue;

    const extraido = extrairCodigoDoNome(celulaNome);
    if (!extraido) continue;

    const situacao = (idxSituacao !== -1 ? celulas[idxSituacao] : undefined) ?? "Ativo";
    produtos.push({ codigo: extraido.codigo, nome: extraido.nome, ativo: situacao.toLowerCase() === "ativo" });
  }
  return produtos;
}

const CABECALHOS_ESTOQUE_MAQUINA = ["Seleção", "Produto", "Disponível"] as const;

/**
 * Relatório de estoque da máquina (portalvendtef.com.br, após handoff de SSO
 * — Decision 2, amendment 4ª rodada). O produto aparece só pelo nome (sem
 * código embutido, diferente das telas do ERP), então `mapaNomeParaCodigo`
 * (construído a partir de `parseProdutosHtml`, todas as páginas) resolve o
 * código real. Linhas cujo nome não bate com nenhum produto conhecido, ou
 * cuja quantidade disponível não é um número não-negativo (ex.: "-2 / 12",
 * um estado de venda além do estoque observado em produção), são
 * descartadas — refletem uma inconsistência do próprio VendPago, não algo
 * que o snapshot deva persistir.
 */
export function parseEstoqueHtml(html: string, mapaNomeParaCodigo: ReadonlyMap<string, string>): SnapshotItemInput[] {
  const $ = cheerio.load(html);
  const tabela = encontrarTabelaPorCabecalhos($, CABECALHOS_ESTOQUE_MAQUINA);
  if (!tabela) return [];

  const cabecalhos = extrairCabecalhos($, tabela);
  const idxSelecao = indiceDaColuna(cabecalhos, "Seleção");
  const idxProduto = indiceDaColuna(cabecalhos, "Produto");
  const idxDisponivel = indiceDaColuna(cabecalhos, "Disponível");

  const itens: SnapshotItemInput[] = [];
  for (const linha of extrairLinhasDeDados($, tabela)) {
    const celulas = linha
      .find("td")
      .map((_, el) => $(el).text().trim())
      .get();
    if (celulas.length <= Math.max(idxSelecao, idxProduto, idxDisponivel)) continue;

    const molaCodigo = celulas[idxSelecao];
    const celulaProduto = celulas[idxProduto];
    const celulaDisponivel = celulas[idxDisponivel];
    if (molaCodigo === undefined || celulaProduto === undefined || celulaDisponivel === undefined) continue;

    const nomeProduto = celulaProduto.replace(/\s+/g, " ").trim();
    const produtoCodigo = mapaNomeParaCodigo.get(nomeProduto);
    const quantidadeTexto = celulaDisponivel.split("/")[0]?.trim();
    const quantidade = quantidadeTexto === "" || quantidadeTexto === undefined ? NaN : Number(quantidadeTexto);

    if (!molaCodigo || !produtoCodigo || !Number.isFinite(quantidade) || quantidade < 0) {
      continue;
    }
    itens.push({ molaCodigo, produtoCodigo, quantidade });
  }
  return itens;
}
