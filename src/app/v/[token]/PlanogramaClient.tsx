"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Mola, Produto, RoteiroLinha, UpsertItemInput } from "@/domain/types";
import { enqueueItem, flushPendingItems } from "@/lib/offlineBuffer";

interface PlanogramaClientProps {
  token: string;
  dispositivoNome: string;
  molasIniciais: Mola[];
  produtos: Produto[];
}

type SyncStatus = "sincronizado" | "pendente" | "offline";

interface ItemEstado {
  quantidadeInserida: number;
  produtoNovoId: string | null;
  status: SyncStatus;
}

function estadoInicial(molas: Mola[]): Record<string, ItemEstado> {
  const estado: Record<string, ItemEstado> = {};
  for (const mola of molas) {
    estado[mola.id] = { quantidadeInserida: 0, produtoNovoId: null, status: "sincronizado" };
  }
  return estado;
}

export function PlanogramaClient({
  token,
  dispositivoNome,
  molasIniciais,
  produtos,
}: PlanogramaClientProps): JSX.Element {
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);
  const [molaSelecionada, setMolaSelecionada] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, ItemEstado>>(() => estadoInicial(molasIniciais));
  const [confirmando, setConfirmando] = useState(false);
  const [roteiro, setRoteiro] = useState<RoteiroLinha[] | null>(null);
  const [erroFechar, setErroFechar] = useState<string | null>(null);

  const abrirVisita = useCallback(async () => {
    setErroAbertura(null);
    try {
      const res = await fetch("/api/visitas", {
        method: "POST",
        headers: { "x-device-token": token },
      });
      if (!res.ok) throw new Error("Falha ao abrir visita");
      const data = (await res.json()) as { visita: { id: string } };
      setVisitaId(data.visita.id);
    } catch {
      setErroAbertura("Sem conexão para iniciar a visita. Tentando novamente...");
    }
  }, [token]);

  useEffect(() => {
    void abrirVisita();
  }, [abrirVisita]);

  const enviarItem = useCallback(
    async (input: UpsertItemInput): Promise<boolean> => {
      try {
        const res = await fetch(`/api/visitas/${input.visitaId}/itens`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-device-token": token },
          body: JSON.stringify({
            molaId: input.molaId,
            quantidadeInserida: input.quantidadeInserida,
            produtoNovoId: input.produtoNovoId,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [token],
  );

  const registrarItem = useCallback(
    (molaId: string, quantidadeInserida: number, produtoNovoId: string | null) => {
      setItens((atual) => ({
        ...atual,
        [molaId]: { quantidadeInserida, produtoNovoId, status: "pendente" },
      }));

      if (!visitaId) return;
      const input: UpsertItemInput = { visitaId, molaId, quantidadeInserida, produtoNovoId };

      void enviarItem(input).then((ok) => {
        setItens((atual) => ({
          ...atual,
          [molaId]: { quantidadeInserida, produtoNovoId, status: ok ? "sincronizado" : "offline" },
        }));
        if (!ok) void enqueueItem(input);
      });
    },
    [visitaId, enviarItem],
  );

  useEffect(() => {
    function onOnline(): void {
      if (!visitaId) return;
      void flushPendingItems((item) => enviarItem(item)).then((resultado) => {
        if (resultado.enviados === 0) return;
        setItens((atual) => {
          const proximo = { ...atual };
          for (const key of Object.keys(proximo)) {
            const item = proximo[key];
            if (item && item.status === "offline") {
              proximo[key] = { ...item, status: "sincronizado" };
            }
          }
          return proximo;
        });
      });
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [visitaId, enviarItem]);

  const molas = useMemo(
    () => [...molasIniciais].sort((a, b) => a.posicao.localeCompare(b.posicao, "pt-BR", { numeric: true })),
    [molasIniciais],
  );

  const produtosPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const molasAlteradas = molas.filter((mola) => {
    const item = itens[mola.id];
    return item && (item.quantidadeInserida > 0 || item.produtoNovoId !== null);
  });

  async function confirmarFechamento(): Promise<void> {
    if (!visitaId) return;
    setErroFechar(null);
    try {
      const res = await fetch(`/api/visitas/${visitaId}/fechar`, {
        method: "POST",
        headers: { "x-device-token": token },
      });
      if (!res.ok) throw new Error("Falha ao fechar visita");
      const data = (await res.json()) as { roteiro: RoteiroLinha[] };
      setRoteiro(data.roteiro);
    } catch {
      setErroFechar("Sem conexão para concluir a visita. Tente novamente quando o sinal voltar.");
    }
  }

  if (roteiro) {
    return (
      <main className="page">
        <h1>Visita concluída</h1>
        <p>Obrigado, {dispositivoNome}. Confira o que foi registrado:</p>
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
      </main>
    );
  }

  const molaAtual = molaSelecionada ? molas.find((m) => m.id === molaSelecionada) ?? null : null;
  const itemAtual = molaAtual ? itens[molaAtual.id] : null;

  if (molaAtual && itemAtual) {
    return (
      <main className="page">
        <h1>Mola {molaAtual.posicao}</h1>
        <div className="card">
          <div className="stepper">
            <button
              type="button"
              onClick={() =>
                registrarItem(
                  molaAtual.id,
                  Math.max(0, itemAtual.quantidadeInserida - 1),
                  itemAtual.produtoNovoId,
                )
              }
              disabled={itemAtual.quantidadeInserida <= 0}
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <span className="valor">{itemAtual.quantidadeInserida}</span>
            <button
              type="button"
              onClick={() =>
                registrarItem(
                  molaAtual.id,
                  Math.min(molaAtual.capacidade, itemAtual.quantidadeInserida + 1),
                  itemAtual.produtoNovoId,
                )
              }
              disabled={itemAtual.quantidadeInserida >= molaAtual.capacidade}
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>
          <p>Capacidade da mola: {molaAtual.capacidade}</p>

          <h3>Trocar produto?</h3>
          <div className="produto-lista">
            <button
              type="button"
              className="produto-opcao"
              data-selecionado={itemAtual.produtoNovoId === null}
              onClick={() => registrarItem(molaAtual.id, itemAtual.quantidadeInserida, null)}
            >
              Manter produto atual ({produtosPorId.get(molaAtual.produtoAtualId)?.nome ?? molaAtual.produtoAtualId})
            </button>
            {produtos
              .filter((produto) => produto.id !== molaAtual.produtoAtualId)
              .map((produto) => (
                <button
                  key={produto.id}
                  type="button"
                  className="produto-opcao"
                  data-selecionado={itemAtual.produtoNovoId === produto.id}
                  onClick={() => registrarItem(molaAtual.id, itemAtual.quantidadeInserida, produto.id)}
                >
                  {produto.nome}
                </button>
              ))}
          </div>

          <button type="button" className="botao-primario" onClick={() => setMolaSelecionada(null)}>
            Voltar ao planograma
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Reposição — {dispositivoNome}</h1>
      {erroAbertura && <p className="erro">{erroAbertura}</p>}
      <div className="mola-grid">
        {molas.map((mola) => {
          const item = itens[mola.id];
          const alterada = Boolean(item && (item.quantidadeInserida > 0 || item.produtoNovoId !== null));
          return (
            <button
              key={mola.id}
              type="button"
              className="mola-botao"
              data-alterada={alterada}
              onClick={() => setMolaSelecionada(mola.id)}
            >
              <span className="mola-posicao">{mola.posicao}</span>
              <span className="mola-produto">
                {produtosPorId.get(mola.produtoAtualId)?.nome ?? mola.produtoAtualId}
              </span>
              {item && item.status === "offline" && <span className="tag tag-offline">offline</span>}
              {item && item.status === "pendente" && <span className="tag tag-pendente">enviando</span>}
              {alterada && item && item.status === "sincronizado" && <span className="tag tag-ok">ok</span>}
            </button>
          );
        })}
      </div>

      {!confirmando ? (
        <button type="button" className="botao-primario" onClick={() => setConfirmando(true)}>
          Fechar visita
        </button>
      ) : (
        <div className="card">
          <h3>Confirmar reposição</h3>
          {molasAlteradas.length === 0 ? (
            <p>Nenhuma mola foi alterada. Fechar mesmo assim?</p>
          ) : (
            <ul>
              {molasAlteradas.map((mola) => {
                const item = itens[mola.id];
                return (
                  <li key={mola.id}>
                    {mola.posicao}: {item?.quantidadeInserida} unidade(s)
                    {item?.produtoNovoId ? " — troca de produto" : ""}
                  </li>
                );
              })}
            </ul>
          )}
          {erroFechar && <p className="erro">{erroFechar}</p>}
          <button type="button" className="botao-primario" onClick={() => void confirmarFechamento()}>
            Confirmar e concluir
          </button>
          <button type="button" className="botao-secundario" onClick={() => setConfirmando(false)}>
            Voltar
          </button>
        </div>
      )}
    </main>
  );
}
