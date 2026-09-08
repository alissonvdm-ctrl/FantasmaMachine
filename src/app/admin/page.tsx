import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
  verifyAdminPassword,
  verifyAdminSessionValue,
} from "@/lib/auth";
import { listMolas } from "@/repos/molas";
import { listProdutos } from "@/repos/produtos";
import { listItensPendentes } from "@/repos/visitas";
import { getItensDoSnapshot, getUltimoSnapshotOk } from "@/repos/snapshots";
import { montarVisaoEstoque } from "@/domain/estoque";

interface PageProps {
  searchParams: { erro?: string };
}

async function login(formData: FormData): Promise<void> {
  "use server";
  const password = formData.get("password");
  if (typeof password !== "string" || !(await verifyAdminPassword(password))) {
    redirect("/admin?erro=1");
  }
  cookies().set(ADMIN_SESSION_COOKIE, createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/admin");
}

export default function AdminPage({ searchParams }: PageProps): JSX.Element {
  const sessionValue = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const autenticado = verifyAdminSessionValue(sessionValue);

  if (!autenticado) {
    return (
      <main className="page">
        <h1>Administração</h1>
        <form className="login" action={login}>
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" required autoFocus />
          {searchParams.erro && <p className="erro">Senha incorreta.</p>}
          <button type="submit" className="botao-primario">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  const db = getDb();
  const molas = listMolas(db);
  const snapshot = getUltimoSnapshotOk(db);
  const snapshotItens = snapshot ? getItensDoSnapshot(db, snapshot.id) : [];
  const itensPendentes = listItensPendentes(db);
  const view = montarVisaoEstoque(molas, snapshotItens, itensPendentes, snapshot?.criadoEm ?? null);
  const produtosPorId = new Map(listProdutos(db).map((p) => [p.id, p]));

  const idadeTexto = view.ultimaSincronizacaoOk
    ? new Date(view.ultimaSincronizacaoOk).toLocaleString("pt-BR")
    : "nunca sincronizado";

  return (
    <main className="page">
      <h1>Estoque</h1>
      <p>
        Última sincronização bem-sucedida: <strong>{idadeTexto}</strong>
      </p>
      <nav>
        <a className="botao-secundario" href="/admin/produtos">
          Produtos
        </a>{" "}
        <a className="botao-secundario" href="/admin/planograma">
          Planograma
        </a>
      </nav>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Posição</th>
              <th>Produto (VendPago)</th>
              <th>Qtd. no VendPago</th>
              <th>Pendente de digitação</th>
            </tr>
          </thead>
          <tbody>
            {view.linhas.map((linha) => (
              <tr key={linha.molaId}>
                <td>{linha.posicao}</td>
                <td>
                  {linha.produtoCodigoSnapshot
                    ? produtosPorId.get(linha.produtoCodigoSnapshot)?.nome ?? linha.produtoCodigoSnapshot
                    : "—"}
                </td>
                <td>{linha.quantidadeSnapshot ?? "—"}</td>
                <td>
                  {linha.quantidadePendente > 0 ? (
                    <span className="tag tag-pendente">
                      {linha.quantidadePendente}
                      {linha.houveTrocaPendente ? " (+ troca)" : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
