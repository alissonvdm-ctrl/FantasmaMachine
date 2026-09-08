import type Database from "better-sqlite3";
import type { Mola } from "@/domain/types";

interface MolaRow {
  id: string;
  posicao: string;
  produto_atual_id: string;
  capacidade: number;
}

function toDomain(row: MolaRow): Mola {
  return {
    id: row.id,
    posicao: row.posicao,
    produtoAtualId: row.produto_atual_id,
    capacidade: row.capacidade,
  };
}

const ordenacaoNumerica: Intl.CollatorOptions = { numeric: true };

export function listMolas(db: Database.Database): Mola[] {
  const rows = db
    .prepare("SELECT id, posicao, produto_atual_id, capacidade FROM molas")
    .all() as MolaRow[];
  return rows.map(toDomain).sort((a, b) => a.posicao.localeCompare(b.posicao, "pt-BR", ordenacaoNumerica));
}

export function getMola(db: Database.Database, id: string): Mola | null {
  const row = db
    .prepare("SELECT id, posicao, produto_atual_id, capacidade FROM molas WHERE id = ?")
    .get(id) as MolaRow | undefined;
  return row ? toDomain(row) : null;
}

export function upsertMola(db: Database.Database, mola: Mola): void {
  db.prepare(
    `INSERT INTO molas (id, posicao, produto_atual_id, capacidade)
     VALUES (@id, @posicao, @produtoAtualId, @capacidade)
     ON CONFLICT (id) DO UPDATE SET
       posicao = excluded.posicao,
       produto_atual_id = excluded.produto_atual_id,
       capacidade = excluded.capacidade`,
  ).run(mola);
}

export function atualizarProdutoAtual(db: Database.Database, molaId: string, produtoId: string): void {
  db.prepare("UPDATE molas SET produto_atual_id = ? WHERE id = ?").run(produtoId, molaId);
}
