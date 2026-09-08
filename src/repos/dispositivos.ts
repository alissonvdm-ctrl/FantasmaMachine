import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
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
export function criarDispositivo(
  db: Database.Database,
  nome: string,
): { dispositivo: Dispositivo; token: string } {
  const token = generateDeviceToken();
  const dispositivo: Dispositivo = {
    id: randomUUID(),
    nome,
    tokenHash: hashToken(token),
    ativo: true,
    criadoEm: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO dispositivos (id, nome, token_hash, ativo, criado_em)
     VALUES (@id, @nome, @tokenHash, 1, @criadoEm)`,
  ).run(dispositivo);
  return { dispositivo, token };
}

export function getDispositivoPorTokenHash(db: Database.Database, tokenHash: string): Dispositivo | null {
  const row = db
    .prepare("SELECT id, nome, token_hash, ativo, criado_em FROM dispositivos WHERE token_hash = ?")
    .get(tokenHash) as DispositivoRow | undefined;
  return row ? toDomain(row) : null;
}

export function listDispositivos(db: Database.Database): Dispositivo[] {
  const rows = db
    .prepare("SELECT id, nome, token_hash, ativo, criado_em FROM dispositivos ORDER BY criado_em DESC")
    .all() as DispositivoRow[];
  return rows.map(toDomain);
}

export function revogarDispositivo(db: Database.Database, id: string): void {
  db.prepare("UPDATE dispositivos SET ativo = 0 WHERE id = ?").run(id);
}
