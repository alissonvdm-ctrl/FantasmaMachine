import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireAdminSession } from "@/lib/auth";
import { getVisita, listItensDaVisita, atualizarStatusVisita } from "@/repos/visitas";
import { listMolas } from "@/repos/molas";
import { listProdutos } from "@/repos/produtos";
import { gerarRoteiro } from "@/domain/roteiro";
import { marcarDigitada } from "@/domain/visita";

interface PageProps {
  params: { visitaId: string };
}

async function marcarComoDigitada(formData: FormData): Promise<void> {
  "use server";
  const visitaId = formData.get("visitaId");
  if (typeof visitaId !== "string") return;

  const db = getDb();
  const visita = await getVisita(db, visitaId);
  if (!visita || visita.status !== "fechada") return;

  const digitada = marcarDigitada(visita, new Date().toISOString());
  await atualizarStatusVisita(db, digitada);
  revalidatePath(`/roteiro/${visitaId}`);
}

export default async function RoteiroPage({ params }: PageProps): Promise<JSX.Element> {
  requireAdminSession();

  const db = getDb();
  const visita = await getVisita(db, params.visitaId);
  if (!visita) notFound();

  const itens = await listItensDaVisita(db, visita.id);
  const molas = await listMolas(db);
  const produtosPorId = new Map((await listProdutos(db)).map((p) => [p.id, p]));
  const roteiro = gerarRoteiro(itens, molas);

  return (
    <main className="page">
      <h1>Roteiro de digitação</h1>
      <p>
        Visita {visita.id} — status: <strong>{visita.status}</strong>
      </p>

      <div className="card">
        {roteiro.length === 0 ? (
          <p>Nenhuma mola foi alterada nesta visita.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Posição</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Troca</th>
              </tr>
            </thead>
            <tbody>
              {roteiro.map((linha) => (
                <tr key={linha.posicao}>
                  <td>{linha.posicao}</td>
                  <td>{produtosPorId.get(linha.produtoCodigo)?.nome ?? linha.produtoCodigo}</td>
                  <td>{linha.quantidade}</td>
                  <td>{linha.houveTroca ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {visita.status === "fechada" && (
        <form action={marcarComoDigitada}>
          <input type="hidden" name="visitaId" value={visita.id} />
          <button type="submit" className="botao-primario">
            Marcar como lançada no VendPago
          </button>
        </form>
      )}
      {visita.status === "digitada" && <p className="tag tag-ok">Já lançada no VendPago</p>}
    </main>
  );
}
