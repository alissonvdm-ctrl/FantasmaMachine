import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { validarTokenDispositivo } from "@/lib/auth";
import { abrirVisita } from "@/domain/visita";
import { criarVisita } from "@/repos/visitas";
import { listMolas } from "@/repos/molas";
import { listProdutosAtivos } from "@/repos/produtos";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.headers.get("x-device-token");
  if (!token) {
    return NextResponse.json({ error: "Token de dispositivo ausente" }, { status: 401 });
  }

  const db = getDb();
  const dispositivo = await validarTokenDispositivo(db, token);
  if (!dispositivo) {
    logger.warn("auth.device.denied", { tokenPrefix: token.slice(0, 8) });
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const visita = abrirVisita(randomUUID(), dispositivo.id, new Date().toISOString());
  await criarVisita(db, visita);

  return NextResponse.json(
    {
      visita,
      molas: await listMolas(db),
      produtos: await listProdutosAtivos(db),
    },
    { status: 201 },
  );
}
