import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import { config } from "@/lib/config";
import { secretsMatch } from "@/lib/crypto";

/**
 * Bootstrap do schema (CREATE TABLE IF NOT EXISTS — idempotente) para quem
 * não tem terminal/CLI à mão: basta visitar esta URL no navegador uma vez
 * após o primeiro deploy, com ?secret=<CRON_SECRET> na query string. Reusa
 * CRON_SECRET (já é o segredo de ações administrativas do servidor) em vez
 * de introduzir mais uma variável de ambiente só para isso.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret") ?? "";
  if (!secretsMatch(secret, config.cronSecret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await applyMigrations(getDb());

  return NextResponse.json({ ok: true, mensagem: "Migrations aplicadas com sucesso." }, { status: 200 });
}
