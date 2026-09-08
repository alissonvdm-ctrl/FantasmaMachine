import type { InStatement } from "@libsql/client";
import type { DbHandle } from "@/db/client";
import type { Snapshot, SnapshotItem } from "@/domain/types";

interface SnapshotRow {
  id: string;
  status: "ok" | "falha";
  criado_em: string;
  erro: string | null;
}

interface SnapshotItemRow {
  snapshot_id: string;
  mola_codigo: string;
  produto_codigo: string;
  quantidade: number;
}

function snapshotToDomain(row: SnapshotRow): Snapshot {
  return { id: row.id, status: row.status, criadoEm: row.criado_em, erro: row.erro };
}

function itemToDomain(row: SnapshotItemRow): SnapshotItem {
  return {
    snapshotId: row.snapshot_id,
    molaCodigo: row.mola_codigo,
    produtoCodigo: row.produto_codigo,
    quantidade: Number(row.quantidade),
  };
}

/** Persiste um snapshot (ok ou falha) e seus itens atomicamente. Falha nunca descarta o snapshot ok anterior. */
export async function salvarSnapshot(
  db: DbHandle,
  snapshot: Snapshot,
  itens: readonly SnapshotItem[],
): Promise<void> {
  const statements: InStatement[] = [
    {
      sql: "INSERT INTO snapshots (id, status, criado_em, erro) VALUES (@id, @status, @criadoEm, @erro)",
      args: { ...snapshot },
    },
    ...itens.map((item) => ({
      sql: `INSERT INTO snapshot_itens (snapshot_id, mola_codigo, produto_codigo, quantidade)
            VALUES (@snapshotId, @molaCodigo, @produtoCodigo, @quantidade)`,
      args: { ...item },
    })),
  ];

  await db.batch(statements);
}

export async function getUltimoSnapshotOk(db: DbHandle): Promise<Snapshot | null> {
  const result = await db.execute(
    "SELECT id, status, criado_em, erro FROM snapshots WHERE status = 'ok' ORDER BY criado_em DESC LIMIT 1",
  );
  const row = result.rows[0] as unknown as SnapshotRow | undefined;
  return row ? snapshotToDomain(row) : null;
}

export async function getItensDoSnapshot(db: DbHandle, snapshotId: string): Promise<SnapshotItem[]> {
  const result = await db.execute({
    sql: "SELECT snapshot_id, mola_codigo, produto_codigo, quantidade FROM snapshot_itens WHERE snapshot_id = @snapshotId",
    args: { snapshotId },
  });
  return (result.rows as unknown as SnapshotItemRow[]).map(itemToDomain);
}
