import { randomUUID } from "node:crypto";
import type { DbHandle } from "@/db/client";
import { generateDeviceToken, hashToken } from "@/lib/crypto";
import type { Dispositivo } from "@/domain/types";

interface DispositivoRow {
  id: string;
  nome: string;
  token_hash: string;
  ativo: number;
  criado_em: string;
}

function toDomain(row: DispositivoRow): Dispositivo {
  return {
    id: row.id,
    nome: row.nome,
    tokenHash: row.token_hash,
    ativo: row.ativo === 1,
    criadoEm: row.criado_em,
  };
}

/**
 * Cria um dispositivo e devolve o token em texto puro exatamente uma vez —
 * apenas o hash SHA-256 é persistido (Decision 4 do DESIGN).
 */
export async function criarDispositivo(
  db: DbHandle,
  nome: string,
): Promise<{ dispositivo: Dispositivo; token: string }> {
  const token = generateDeviceToken();
  const dispositivo: Dispositivo = {
    id: randomUUID(),
    nome,
    tokenHash: hashToken(token),
    ativo: true,
    criadoEm: new Date().toISOString(),
  };
  await db.execute({
    sql: `INSERT INTO dispositivos (id, nome, token_hash, ativo, criado_em)
          VALUES (@id, @nome, @tokenHash, 1, @criadoEm)`,
    args: { ...dispositivo },
  });
  return { dispositivo, token };
}

export async function getDispositivoPorTokenHash(db: DbHandle, tokenHash: string): Promise<Dispositivo | null> {
  const result = await db.execute({
    sql: "SELECT id, nome, token_hash, ativo, criado_em FROM dispositivos WHERE token_hash = @tokenHash",
    args: { tokenHash },
  });
  const row = result.rows[0] as unknown as DispositivoRow | undefined;
  return row ? toDomain(row) : null;
}

export async function listDispositivos(db: DbHandle): Promise<Dispositivo[]> {
  const result = await db.execute("SELECT id, nome, token_hash, ativo, criado_em FROM dispositivos ORDER BY criado_em DESC");
  return (result.rows as unknown as DispositivoRow[]).map(toDomain);
}

export async function revogarDispositivo(db: DbHandle, id: string): Promise<void> {
  await db.execute({ sql: "UPDATE dispositivos SET ativo = 0 WHERE id = @id", args: { id } });
}
