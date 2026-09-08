import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth";
import { getDb } from "@/db/client";
import { atualizarProduto, criarProduto, listProdutos } from "@/repos/produtos";

async function adicionarProduto(formData: FormData): Promise<void> {
  "use server";
  const id = formData.get("id");
  const nome = formData.get("nome");
  if (typeof id !== "string" || typeof nome !== "string" || !id.trim() || !nome.trim()) return;
  const db = getDb();
  await criarProduto(db, { id: id.trim(), nome: nome.trim() });
  revalidatePath("/admin/produtos");
}

async function alternarAtivo(formData: FormData): Promise<void> {
  "use server";
  const id = formData.get("id");
  const ativo = formData.get("ativo");
  if (typeof id !== "string") return;
  const db = getDb();
  await atualizarProduto(db, id, { ativo: ativo === "1" });
  revalidatePath("/admin/produtos");
}

export default async function ProdutosPage(): Promise<JSX.Element> {
  requireAdminSession();
  const db = getDb();
  const produtos = await listProdutos(db);

  return (
    <main className="page">
      <h1>Produtos</h1>
      <p>
        <a className="botao-secundario" href="/admin">
          Voltar ao estoque
        </a>
      </p>

      <div className="card">
        <h3>Novo produto</h3>
        <form action={adicionarProduto} className="login">
          <label htmlFor="id">Código (igual ao VendPago)</label>
          <input id="id" name="id" type="text" required />
          <label htmlFor="nome">Nome</label>
          <input id="nome" name="nome" type="text" required />
          <button type="submit" className="botao-primario">
            Cadastrar
          </button>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {produtos.map((produto) => (
              <tr key={produto.id}>
                <td>{produto.id}</td>
                <td>{produto.nome}</td>
                <td>{produto.ativo ? "Sim" : "Não"}</td>
                <td>
                  <form action={alternarAtivo}>
                    <input type="hidden" name="id" value={produto.id} />
                    <input type="hidden" name="ativo" value={produto.ativo ? "0" : "1"} />
                    <button type="submit" className="botao-secundario">
                      {produto.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
