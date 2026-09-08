import type { DbHandle } from "@/db/client";
import type { Produto } from "@/domain/types";

interface ProdutoRow {
  id: string;
  nome: string;
  ativo: number;
}

function toDomain(row: ProdutoRow): Produto {
  return { id: row.id, nome: row.nome, ativo: row.ativo === 1 };
}

export async function listProdutos(db: DbHandle): Promise<Produto[]> {
  const result = await db.execute("SELECT id, nome, ativo FROM produtos ORDER BY nome");
  return (result.rows as unknown as ProdutoRow[]).map(toDomain);
}

export async function listProdutosAtivos(db: DbHandle): Promise<Produto[]> {
  const result = await db.execute("SELECT id, nome, ativo FROM produtos WHERE ativo = 1 ORDER BY nome");
  return (result.rows as unknown as ProdutoRow[]).map(toDomain);
}

export async function getProduto(db: DbHandle, id: string): Promise<Produto | null> {
  const result = await db.execute({
    sql: "SELECT id, nome, ativo FROM produtos WHERE id = @id",
    args: { id },
  });
  const row = result.rows[0] as unknown as ProdutoRow | undefined;
  return row ? toDomain(row) : null;
}

export async function criarProduto(db: DbHandle, input: { id: string; nome: string }): Promise<void> {
  await db.execute({
    sql: "INSERT INTO produtos (id, nome, ativo) VALUES (@id, @nome, 1)",
    args: input,
  });
}

export async function atualizarProduto(
  db: DbHandle,
  id: string,
  changes: { nome?: string; ativo?: boolean },
): Promise<void> {
  if (changes.nome !== undefined) {
    await db.execute({ sql: "UPDATE produtos SET nome = @nome WHERE id = @id", args: { nome: changes.nome, id } });
  }
  if (changes.ativo !== undefined) {
    await db.execute({
      sql: "UPDATE produtos SET ativo = @ativo WHERE id = @id",
      args: { ativo: changes.ativo ? 1 : 0, id },
    });
  }
}
