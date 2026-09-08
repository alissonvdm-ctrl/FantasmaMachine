import type Database from "better-sqlite3";
import type { UpsertItemInput, Visita, VisitaItem, VisitaStatus } from "@/domain/types";

interface VisitaRow {
  id: string;
  dispositivo_id: string;
  status: VisitaStatus;
  aberta_em: string;
  fechada_em: string | null;
  digitada_em: string | null;
}

interface VisitaItemRow {
  visita_id: string;
  mola_id: string;
  quantidade_inserida: number;
  produto_novo_id: string | null;
  atualizado_em: string;
}

function visitaToDomain(row: VisitaRow): Visita {
  return {
    id: row.id,
    dispositivoId: row.dispositivo_id,
    status: row.status,
    abertaEm: row.aberta_em,
    fechadaEm: row.fechada_em,
    digitadaEm: row.digitada_em,
  };
}

function itemToDomain(row: VisitaItemRow): VisitaItem {
  return {
    visitaId: row.visita_id,
    molaId: row.mola_id,
    quantidadeInserida: row.quantidade_inserida,
    produtoNovoId: row.produto_novo_id,
    atualizadoEm: row.atualizado_em,
  };
}

export function criarVisita(db: Database.Database, visita: Visita): void {
  db.prepare(
    `INSERT INTO visitas (id, dispositivo_id, status, aberta_em, fechada_em, digitada_em)
     VALUES (@id, @dispositivoId, @status, @abertaEm, @fechadaEm, @digitadaEm)`,
  ).run(visita);
}

export function getVisita(db: Database.Database, id: string): Visita | null {
  const row = db
    .prepare(
      "SELECT id, dispositivo_id, status, aberta_em, fechada_em, digitada_em FROM visitas WHERE id = ?",
    )
    .get(id) as VisitaRow | undefined;
  return row ? visitaToDomain(row) : null;
}

export function atualizarStatusVisita(db: Database.Database, visita: Visita): void {
  db.prepare(
    `UPDATE visitas SET status = @status, fechada_em = @fechadaEm, digitada_em = @digitadaEm
     WHERE id = @id`,
  ).run(visita);
}

/** Registro idempotente: reenvios do buffer offline resultam no mesmo estado final. */
export function upsertItem(db: Database.Database, input: UpsertItemInput): void {
  db.prepare(
    `INSERT INTO visita_itens (visita_id, mola_id, quantidade_inserida, produto_novo_id, atualizado_em)
     VALUES (@visitaId, @molaId, @quantidadeInserida, @produtoNovoId, @atualizadoEm)
     ON CONFLICT (visita_id, mola_id) DO UPDATE SET
       quantidade_inserida = excluded.quantidade_inserida,
       produto_novo_id     = excluded.produto_novo_id,
       atualizado_em       = excluded.atualizado_em`,
  ).run({ ...input, atualizadoEm: new Date().toISOString() });
}

export function listItensDaVisita(db: Database.Database, visitaId: string): VisitaItem[] {
  const rows = db
    .prepare(
      "SELECT visita_id, mola_id, quantidade_inserida, produto_novo_id, atualizado_em FROM visita_itens WHERE visita_id = ?",
    )
    .all(visitaId) as VisitaItemRow[];
  return rows.map(itemToDomain);
}

export function listVisitasFechadasNaoDigitadas(db: Database.Database): Visita[] {
  const rows = db
    .prepare(
      "SELECT id, dispositivo_id, status, aberta_em, fechada_em, digitada_em FROM visitas WHERE status = 'fechada'",
    )
    .all() as VisitaRow[];
  return rows.map(visitaToDomain);
}

/** Itens de todas as visitas fechadas ainda não digitadas — base da pendência em AT-003. */
export function listItensPendentes(db: Database.Database): VisitaItem[] {
  const rows = db
    .prepare(
      `SELECT vi.visita_id, vi.mola_id, vi.quantidade_inserida, vi.produto_novo_id, vi.atualizado_em
       FROM visita_itens vi
       JOIN visitas v ON v.id = vi.visita_id
       WHERE v.status = 'fechada'`,
    )
    .all() as VisitaItemRow[];
  return rows.map(itemToDomain);
}
