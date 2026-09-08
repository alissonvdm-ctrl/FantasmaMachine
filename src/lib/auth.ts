import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { DbHandle } from "@/db/client";
import { config } from "@/lib/config";
import { hashToken, hashesMatch, verifyPasswordHash } from "@/lib/crypto";
import { getDispositivoPorTokenHash } from "@/repos/dispositivos";
import type { Dispositivo } from "@/domain/types";

export const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_PAYLOAD = "admin";

/**
 * Valida um token de dispositivo vindo da URL. Escopo restrito: só devolve o
 * dispositivo se o hash bater e ele estiver ativo; nunca dá acesso a /admin.
 */
export async function validarTokenDispositivo(db: DbHandle, token: string): Promise<Dispositivo | null> {
  const hash = hashToken(token);
  const dispositivo = await getDispositivoPorTokenHash(db, hash);
  if (!dispositivo || !dispositivo.ativo) return null;
  if (!hashesMatch(dispositivo.tokenHash, hash)) return null;
  return dispositivo;
}

function signSessionPayload(secret: string): string {
  return createHmac("sha256", secret).update(ADMIN_SESSION_PAYLOAD).digest("hex");
}

export function verifyAdminPassword(password: string): Promise<boolean> {
  return Promise.resolve(verifyPasswordHash(password, config.adminPasswordHash));
}

export function createAdminSessionValue(): string {
  return ADMIN_SESSION_PAYLOAD + "." + signSessionPayload(config.sessionSecret);
}

export function verifyAdminSessionValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const separatorIndex = value.indexOf(".");
  if (separatorIndex === -1) return false;
  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  if (payload !== ADMIN_SESSION_PAYLOAD) return false;
  const expected = signSessionPayload(config.sessionSecret);
  return hashesMatch(signature, expected);
}

/** Usado por Server Components/Actions de área administrativa (não pelas Route Handlers). */
export function requireAdminSession(): void {
  const value = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionValue(value)) {
    redirect("/admin");
  }
}

/** Checagem equivalente para Route Handlers (`/api/**`), que não devem redirecionar. */
export function isAdminRequestAuthorized(request: NextRequest): boolean {
  const value = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionValue(value);
}
