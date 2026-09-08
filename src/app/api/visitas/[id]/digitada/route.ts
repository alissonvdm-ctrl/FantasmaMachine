import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isAdminRequestAuthorized } from "@/lib/auth";
import { getVisita, atualizarStatusVisita } from "@/repos/visitas";
import { marcarDigitada, TransicaoInvalidaError } from "@/domain/visita";

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getDb();
  const visita = await getVisita(db, params.id);
  if (!visita) {
    return NextResponse.json({ error: "Visita não encontrada" }, { status: 404 });
  }

  let digitada;
  try {
    digitada = marcarDigitada(visita, new Date().toISOString());
  } catch (err) {
    if (err instanceof TransicaoInvalidaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await atualizarStatusVisita(db, digitada);
  return NextResponse.json({ visita: digitada }, { status: 200 });
}
