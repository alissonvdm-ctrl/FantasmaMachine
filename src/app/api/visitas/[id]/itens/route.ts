import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { validarTokenDispositivo } from "@/lib/auth";
import { getVisita, upsertItem } from "@/repos/visitas";
import { getMola } from "@/repos/molas";
import { listProdutosAtivos } from "@/repos/produtos";
import { garantirAberta, validarItem, VisitaEstadoError, ItemInvalidoError } from "@/domain/visita";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: { id: string };
}

interface ItemBody {
  molaId?: unknown;
  quantidadeInserida?: unknown;
  produtoNovoId?: unknown;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const token = request.headers.get("x-device-token");
  if (!token) {
    return NextResponse.json({ error: "Token de dispositivo ausente" }, { status: 401 });
  }

  const db = getDb();
  const dispositivo = validarTokenDispositivo(db, token);
  if (!dispositivo) {
    logger.warn("auth.device.denied", { tokenPrefix: token.slice(0, 8) });
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const visita = getVisita(db, params.id);
  if (!visita || visita.dispositivoId !== dispositivo.id) {
    return NextResponse.json({ error: "Visita não encontrada" }, { status: 404 });
  }

  const body = (await request.json()) as ItemBody;
  if (typeof body.molaId !== "string" || typeof body.quantidadeInserida !== "number") {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }
  const produtoNovoId = typeof body.produtoNovoId === "string" ? body.produtoNovoId : null;

  try {
    garantirAberta(visita);
  } catch (err) {
    if (err instanceof VisitaEstadoError) {
      logger.warn("visita.item.conflito", { visitaId: visita.id });
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const mola = getMola(db, body.molaId);
  if (!mola) {
    return NextResponse.json({ error: "Mola não encontrada" }, { status: 404 });
  }

  const produtosAtivos = new Set(listProdutosAtivos(db).map((p) => p.id));
  const input = {
    visitaId: visita.id,
    molaId: mola.id,
    quantidadeInserida: body.quantidadeInserida,
    produtoNovoId,
  };

  try {
    validarItem(input, mola, produtosAtivos);
  } catch (err) {
    if (err instanceof ItemInvalidoError) {
      logger.warn("visita.item.invalid", { visitaId: visita.id, molaId: mola.id });
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  upsertItem(db, input);

  return NextResponse.json({ ok: true }, { status: 200 });
}
