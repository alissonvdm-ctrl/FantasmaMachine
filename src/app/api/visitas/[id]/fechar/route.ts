import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { validarTokenDispositivo } from "@/lib/auth";
import { getVisita, atualizarStatusVisita, listItensDaVisita } from "@/repos/visitas";
import { listMolas, atualizarProdutoAtual } from "@/repos/molas";
import { fecharVisita, TransicaoInvalidaError } from "@/domain/visita";
import { gerarRoteiro } from "@/domain/roteiro";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: { id: string };
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

  let fechada;
  try {
    fechada = fecharVisita(visita, new Date().toISOString());
  } catch (err) {
    if (err instanceof TransicaoInvalidaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const itens = listItensDaVisita(db, visita.id);
  const molas = listMolas(db);

  // Calcula o roteiro antes de qualquer escrita: se falhar (ex.: mola ausente
  // do planograma), a visita permanece 'aberta' e o abastecedor pode retentar,
  // em vez de ficar presa em 'fechada' sem um roteiro correspondente.
  const roteiro = gerarRoteiro(itens, molas);

  const persistirFechamento = db.transaction(() => {
    atualizarStatusVisita(db, fechada);
    // Planograma reflete a troca somente no fechamento (Decision 5 do DESIGN).
    for (const item of itens) {
      if (item.produtoNovoId) {
        atualizarProdutoAtual(db, item.molaId, item.produtoNovoId);
      }
    }
  });
  persistirFechamento();

  return NextResponse.json({ visita: fechada, roteiro }, { status: 200 });
}
