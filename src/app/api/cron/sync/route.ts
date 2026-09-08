import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { config } from "@/lib/config";
import { secretsMatch } from "@/lib/crypto";
import { executarSincronizacao } from "@/worker/sync";

/**
 * Substitui o processo `node-cron` standalone (Decision 7 do DESIGN): Vercel
 * não suporta processo de longa duração, então a sincronização vira um
 * endpoint acionado externamente (GitHub Actions 3x/dia, ou Vercel Cron —
 * limitado a 1x/dia no plano Hobby). Protegido por `CRON_SECRET`.
 */
function autorizado(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  return secretsMatch(header, `Bearer ${config.cronSecret}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getDb();
  const snapshot = await executarSincronizacao({ db });

  return NextResponse.json({ snapshot }, { status: snapshot.status === "ok" ? 200 : 502 });
}

/** Vercel Cron aciona rotas de cron via GET. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
