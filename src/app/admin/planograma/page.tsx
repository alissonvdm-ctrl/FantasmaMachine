import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth";
import { getDb } from "@/db/client";
import { listMolas, upsertMola } from "@/repos/molas";
import { listProdutosAtivos } from "@/repos/produtos";

async function salvarMola(formData: FormData): Promise<void> {
  "use server";
  const id = formData.get("id");
  const posicao = formData.get("posicao");
  const produtoAtualId = formData.get("produtoAtualId");
  const capacidade = formData.get("capacidade");
  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof posicao !== "string" ||
    !posicao.trim() ||
    typeof produtoAtualId !== "string" ||
    !produtoAtualId.trim() ||
    typeof capacidade !== "string"
  ) {
    return;
  }
  const capacidadeNum = Number(capacidade);
  if (!Number.isInteger(capacidadeNum) || capacidadeNum <= 0) return;

  const db = getDb();
  upsertMola(db, {
    id: id.trim(),
    posicao: posicao.trim(),
    produtoAtualId: produtoAtualId.trim(),
    capacidade: capacidadeNum,
  });
  revalidatePath("/admin/planograma");
}

export default function PlanogramaPage(): JSX.Element {
  requireAdminSession();
  const db = getDb();
  const molas = listMolas(db);
  const produtos = listProdutosAtivos(db);

  return (
    <main className="page">
      <h1>Planograma</h1>
      <p>
        <a className="botao-secundario" href="/admin">
          Voltar ao estoque
        </a>
      </p>

      <div className="card">
        <h3>Cadastrar / atualizar mola</h3>
        <form action={salvarMola} className="login">
          <label htmlFor="id">Código da mola (igual ao VendPago)</label>
          <input id="id" name="id" type="text" required />
          <label htmlFor="posicao">Posição de exibição</label>
          <input id="posicao" name="posicao" type="text" required />
          <label htmlFor="produtoAtualId">Produto atual</label>
          <select id="produtoAtualId" name="produtoAtualId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {produtos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome}
              </option>
            ))}
          </select>
          <label htmlFor="capacidade">Capacidade</label>
          <input id="capacidade" name="capacidade" type="number" min={1} required />
          <button type="submit" className="botao-primario">
            Salvar
          </button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Posição</th>
              <th>Código</th>
              <th>Produto atual</th>
              <th>Capacidade</th>
            </tr>
          </thead>
          <tbody>
            {molas.map((mola) => {
              const produto = produtos.find((p) => p.id === mola.produtoAtualId);
              return (
                <tr key={mola.id}>
                  <td>{mola.posicao}</td>
                  <td>{mola.id}</td>
                  <td>{produto?.nome ?? mola.produtoAtualId}</td>
                  <td>{mola.capacidade}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
