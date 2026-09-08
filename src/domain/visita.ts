import type { Mola, UpsertItemInput, Visita } from "@/domain/types";

export class VisitaEstadoError extends Error {
  constructor(status: Visita["status"]) {
    super("Visita não está aberta para registrar itens (status atual: " + status + ")");
    this.name = "VisitaEstadoError";
  }
}

export class TransicaoInvalidaError extends Error {
  constructor(de: Visita["status"], para: Visita["status"]) {
    super("Transição de estado inválida: " + de + " -> " + para);
    this.name = "TransicaoInvalidaError";
  }
}

export class ItemInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemInvalidoError";
  }
}

export function abrirVisita(id: string, dispositivoId: string, agora: string): Visita {
  return {
    id,
    dispositivoId,
    status: "aberta",
    abertaEm: agora,
    fechadaEm: null,
    digitadaEm: null,
  };
}

export function garantirAberta(visita: Visita): void {
  if (visita.status !== "aberta") {
    throw new VisitaEstadoError(visita.status);
  }
}

export function fecharVisita(visita: Visita, agora: string): Visita {
  if (visita.status !== "aberta") {
    throw new TransicaoInvalidaError(visita.status, "fechada");
  }
  return { ...visita, status: "fechada", fechadaEm: agora };
}

export function marcarDigitada(visita: Visita, agora: string): Visita {
  if (visita.status !== "fechada") {
    throw new TransicaoInvalidaError(visita.status, "digitada");
  }
  return { ...visita, status: "digitada", digitadaEm: agora };
}

/**
 * Valida um item antes da persistência: quantidade inteira não negativa e
 * limitada à capacidade da mola; produto restrito à lista fixa cadastrada.
 */
export function validarItem(
  input: UpsertItemInput,
  mola: Mola,
  produtosAtivos: ReadonlySet<string>,
): void {
  if (!Number.isInteger(input.quantidadeInserida) || input.quantidadeInserida < 0) {
    throw new ItemInvalidoError("Quantidade deve ser um inteiro não negativo");
  }
  if (input.quantidadeInserida > mola.capacidade) {
    throw new ItemInvalidoError(
      "Quantidade " + input.quantidadeInserida + " excede a capacidade da mola (" + mola.capacidade + ")",
    );
  }
  if (input.produtoNovoId !== null && !produtosAtivos.has(input.produtoNovoId)) {
    throw new ItemInvalidoError("Produto não encontrado na lista fixa: " + input.produtoNovoId);
  }
}
