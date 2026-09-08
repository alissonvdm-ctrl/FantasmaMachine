import type Database from "better-sqlite3";
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
    quantidade: row.quantidade,
  };
}

/** Persiste um snapshot (ok ou falha). Falha nunca descarta o snapshot ok anterior. */
export function salvarSnapshot(
  db: Database.Database,
  snapshot: Snapshot,
  itens: readonly SnapshotItem[],
): void {
  const insertSnapshot = db.prepare(
    "INSERT INTO snapshots (id, status, criado_em, erro) VALUES (@id, @status, @criadoEm, @erro)",
  );
  const insertItem = db.prepare(
    `INSERT INTO snapshot_itens (snapshot_id, mola_codigo, produto_codigo, quantidade)
     VALUES (@snapshotId, @molaCodigo, @produtoCodigo, @quantidade)`,
  );

  const tx = db.transaction(() => {
    insertSnapshot.run(snapshot);
    for (const item of itens) insertItem.run(item);
  });
  tx();
}

export function getUltimoSnapshotOk(db: Database.Database): Snapshot | null {
  const row = db
    .prepare("SELECT id, status, criado_em, erro FROM snapshots WHERE status = 'ok' ORDER BY criado_em DESC LIMIT 1")
    .get() as SnapshotRow | undefined;
  return row ? snapshotToDomain(row) : null;
}

export function getItensDoSnapshot(db: Database.Database, snapshotId: string): SnapshotItem[] {
  const rows = db
    .prepare(
      "SELECT snapshot_id, mola_codigo, produto_codigo, quantidade FROM snapshot_itens WHERE snapshot_id = ?",
    )
    .all(snapshotId) as SnapshotItemRow[];
  return rows.map(itemToDomain);
}
