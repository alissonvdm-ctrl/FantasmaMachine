import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { validarTokenDispositivo } from "@/lib/auth";
import { listMolas } from "@/repos/molas";
import { listProdutosAtivos } from "@/repos/produtos";
import { PlanogramaClient } from "./PlanogramaClient";

interface PageProps {
  params: { token: string };
}

export default function VisitaPage({ params }: PageProps) {
  const db = getDb();
  const dispositivo = validarTokenDispositivo(db, params.token);
  if (!dispositivo) {
    notFound();
  }

  const molas = listMolas(db);
  const produtos = listProdutosAtivos(db);

  return (
    <PlanogramaClient
      token={params.token}
      dispositivoNome={dispositivo.nome}
      molasIniciais={molas}
      produtos={produtos}
    />
  );
}
