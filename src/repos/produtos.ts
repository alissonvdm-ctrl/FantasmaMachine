import type Database from "better-sqlite3";
import type { Produto } from "@/domain/types";

interface ProdutoRow {
  id: string;
  nome: string;
  ativo: number;
}

function toDomain(row: ProdutoRow): Produto {
  return { id: row.id, nome: row.nome, ativo: row.ativo === 1 };
}

export function listProdutos(db: Database.Database): Produto[] {
  const rows = db.prepare("SELECT id, nome, ativo FROM produtos ORDER BY nome").all() as ProdutoRow[];
  return rows.map(toDomain);
}

export function listProdutosAtivos(db: Database.Database): Produto[] {
  const rows = db
    .prepare("SELECT id, nome, ativo FROM produtos WHERE ativo = 1 ORDER BY nome")
    .all() as ProdutoRow[];
  return rows.map(toDomain);
}

export function getProduto(db: Database.Database, id: string): Produto | null {
  const row = db.prepare("SELECT id, nome, ativo FROM produtos WHERE id = ?").get(id) as
    | ProdutoRow
    | undefined;
  return row ? toDomain(row) : null;
}

export function criarProduto(db: Database.Database, input: { id: string; nome: string }): void {
  db.prepare("INSERT INTO produtos (id, nome, ativo) VALUES (@id, @nome, 1)").run(input);
}

export function atualizarProduto(
  db: Database.Database,
  id: string,
  changes: { nome?: string; ativo?: boolean },
): void {
  if (changes.nome !== undefined) {
    db.prepare("UPDATE produtos SET nome = ? WHERE id = ?").run(changes.nome, id);
  }
  if (changes.ativo !== undefined) {
    db.prepare("UPDATE produtos SET ativo = ? WHERE id = ?").run(changes.ativo ? 1 : 0, id);
  }
}
