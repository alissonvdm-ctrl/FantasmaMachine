export interface Produto {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface Mola {
  id: string;
  posicao: string;
  produtoAtualId: string;
  capacidade: number;
}

export interface Dispositivo {
  id: string;
  nome: string;
  tokenHash: string;
  ativo: boolean;
  criadoEm: string;
}

export type VisitaStatus = "aberta" | "fechada" | "digitada";

export interface Visita {
  id: string;
  dispositivoId: string;
  status: VisitaStatus;
  abertaEm: string;
  fechadaEm: string | null;
  digitadaEm: string | null;
}

export interface VisitaItem {
  visitaId: string;
  molaId: string;
  quantidadeInserida: number;
  produtoNovoId: string | null;
  atualizadoEm: string;
}

export interface UpsertItemInput {
  visitaId: string;
  molaId: string;
  quantidadeInserida: number;
  produtoNovoId: string | null;
}

export type SnapshotStatus = "ok" | "falha";

export interface Snapshot {
  id: string;
  status: SnapshotStatus;
  criadoEm: string;
  erro: string | null;
}

export interface SnapshotItem {
  snapshotId: string;
  molaCodigo: string;
  produtoCodigo: string;
  quantidade: number;
}

/** Saída do parser, antes de saber a qual snapshot o item pertence. */
export type SnapshotItemInput = Omit<SnapshotItem, "snapshotId">;

export interface RoteiroLinha {
  posicao: string;
  produtoCodigo: string;
  quantidade: number;
  houveTroca: boolean;
}

export interface EstoqueLinha {
  molaId: string;
  posicao: string;
  produtoCodigoSnapshot: string | null;
  quantidadeSnapshot: number | null;
  quantidadePendente: number;
  houveTrocaPendente: boolean;
}

export interface EstoqueView {
  linhas: EstoqueLinha[];
  ultimaSincronizacaoOk: string | null;
}
