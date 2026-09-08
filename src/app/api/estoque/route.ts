import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isAdminRequestAuthorized } from "@/lib/auth";
import { listMolas } from "@/repos/molas";
import { listItensPendentes } from "@/repos/visitas";
import { getUltimoSnapshotOk, getItensDoSnapshot } from "@/repos/snapshots";
import { montarVisaoEstoque } from "@/domain/estoque";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getDb();
  const molas = listMolas(db);
  const snapshot = getUltimoSnapshotOk(db);
  const snapshotItens = snapshot ? getItensDoSnapshot(db, snapshot.id) : [];
  const itensPendentes = listItensPendentes(db);

  const view = montarVisaoEstoque(molas, snapshotItens, itensPendentes, snapshot?.criadoEm ?? null);

  return NextResponse.json(view, { status: 200 });
}
