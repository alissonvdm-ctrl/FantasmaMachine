import type { DbHandle } from "@/db/client";
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
    quantidadeInserida: Number(row.quantidade_inserida),
    produtoNovoId: row.produto_novo_id,
    atualizadoEm: row.atualizado_em,
  };
}

export async function criarVisita(db: DbHandle, visita: Visita): Promise<void> {
  await db.execute({
    sql: `INSERT INTO visitas (id, dispositivo_id, status, aberta_em, fechada_em, digitada_em)
          VALUES (@id, @dispositivoId, @status, @abertaEm, @fechadaEm, @digitadaEm)`,
    args: { ...visita },
  });
}

export async function getVisita(db: DbHandle, id: string): Promise<Visita | null> {
  const result = await db.execute({
    sql: "SELECT id, dispositivo_id, status, aberta_em, fechada_em, digitada_em FROM visitas WHERE id = @id",
    args: { id },
  });
  const row = result.rows[0] as unknown as VisitaRow | undefined;
  return row ? visitaToDomain(row) : null;
}

export async function atualizarStatusVisita(db: DbHandle, visita: Visita): Promise<void> {
  await db.execute({
    sql: `UPDATE visitas SET status = @status, fechada_em = @fechadaEm, digitada_em = @digitadaEm
          WHERE id = @id`,
    args: { ...visita },
  });
}

/** Registro idempotente: reenvios do buffer offline resultam no mesmo estado final. */
export async function upsertItem(db: DbHandle, input: UpsertItemInput): Promise<void> {
  await db.execute({
    sql: `INSERT INTO visita_itens (visita_id, mola_id, quantidade_inserida, produto_novo_id, atualizado_em)
          VALUES (@visitaId, @molaId, @quantidadeInserida, @produtoNovoId, @atualizadoEm)
          ON CONFLICT (visita_id, mola_id) DO UPDATE SET
            quantidade_inserida = excluded.quantidade_inserida,
            produto_novo_id     = excluded.produto_novo_id,
            atualizado_em       = excluded.atualizado_em`,
    args: { ...input, atualizadoEm: new Date().toISOString() },
  });
}

export async function listItensDaVisita(db: DbHandle, visitaId: string): Promise<VisitaItem[]> {
  const result = await db.execute({
    sql: "SELECT visita_id, mola_id, quantidade_inserida, produto_novo_id, atualizado_em FROM visita_itens WHERE visita_id = @visitaId",
    args: { visitaId },
  });
  return (result.rows as unknown as VisitaItemRow[]).map(itemToDomain);
}

export async function listVisitasFechadasNaoDigitadas(db: DbHandle): Promise<Visita[]> {
  const result = await db.execute(
    "SELECT id, dispositivo_id, status, aberta_em, fechada_em, digitada_em FROM visitas WHERE status = 'fechada'",
  );
  return (result.rows as unknown as VisitaRow[]).map(visitaToDomain);
}

/** Itens de todas as visitas fechadas ainda não digitadas — base da pendência em AT-003. */
export async function listItensPendentes(db: DbHandle): Promise<VisitaItem[]> {
  const result = await db.execute(
    `SELECT vi.visita_id, vi.mola_id, vi.quantidade_inserida, vi.produto_novo_id, vi.atualizado_em
     FROM visita_itens vi
     JOIN visitas v ON v.id = vi.visita_id
     WHERE v.status = 'fechada'`,
  );
  return (result.rows as unknown as VisitaItemRow[]).map(itemToDomain);
}
