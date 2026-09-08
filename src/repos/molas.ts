import type { DbHandle } from "@/db/client";
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
    capacidade: Number(row.capacidade),
  };
}

const ordenacaoNumerica: Intl.CollatorOptions = { numeric: true };

export async function listMolas(db: DbHandle): Promise<Mola[]> {
  const result = await db.execute("SELECT id, posicao, produto_atual_id, capacidade FROM molas");
  return (result.rows as unknown as MolaRow[])
    .map(toDomain)
    .sort((a, b) => a.posicao.localeCompare(b.posicao, "pt-BR", ordenacaoNumerica));
}

export async function getMola(db: DbHandle, id: string): Promise<Mola | null> {
  const result = await db.execute({
    sql: "SELECT id, posicao, produto_atual_id, capacidade FROM molas WHERE id = @id",
    args: { id },
  });
  const row = result.rows[0] as unknown as MolaRow | undefined;
  return row ? toDomain(row) : null;
}

export async function upsertMola(db: DbHandle, mola: Mola): Promise<void> {
  await db.execute({
    sql: `INSERT INTO molas (id, posicao, produto_atual_id, capacidade)
          VALUES (@id, @posicao, @produtoAtualId, @capacidade)
          ON CONFLICT (id) DO UPDATE SET
            posicao = excluded.posicao,
            produto_atual_id = excluded.produto_atual_id,
            capacidade = excluded.capacidade`,
    args: { ...mola },
  });
}

export async function atualizarProdutoAtual(db: DbHandle, molaId: string, produtoId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE molas SET produto_atual_id = @produtoId WHERE id = @molaId",
    args: { produtoId, molaId },
  });
}
