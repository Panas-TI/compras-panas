"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { codigoCurto, hhmm, nomeLimpo } from "../lib";
import { salvarPlanoAction, apagarPlanoAction, type LinhaEntrada, type TipoFolha } from "../actions";

export type TurnoOpt = { id: string; nome: string; hora_inicio: string; hora_fim: string };
export type ProdutoOpt = {
  id: string;
  nome: string;
  estoque_seguranca: number | null;
  contado: number | null;
  /** KG, L, UN… Recheio e massa são pesados; sem a unidade o número é ambíguo. */
  unidade: string | null;
};
export type ColabOpt = { id: string; nome: string };

/** produto_id → turno_id → { qtd, colaboradores } */
type Grade = Record<string, Record<string, { qtd: string; colabs: string[] }>>;

export function EditorPlano({
  data,
  turnos,
  produtos,
  colaboradores,
  gradeInicial,
  produtosIniciais,
  obsInicial,
  tipo,
}: {
  data: string;
  turnos: TurnoOpt[];
  produtos: ProdutoOpt[];
  colaboradores: ColabOpt[];
  gradeInicial: Grade;
  produtosIniciais: string[];
  obsInicial: string;
  tipo: TipoFolha;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<Grade>(gradeInicial);
  const [escolhidos, setEscolhidos] = useState<string[]>(produtosIniciais);
  const [obs, setObs] = useState(obsInicial);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [editandoEquipe, setEditandoEquipe] = useState<{ p: string; t: string } | null>(null);

  // Recheio e massa não têm código numérico — a coluna ficaria só com traços.
  const temCodigo = tipo === "final";
  const aba = tipo === "final" ? "" : "?aba=recheios";
  const rotulo = tipo === "final" ? "produtos acabados" : "recheios e massas";

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const candidatos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return produtos
      .filter((p) => !escolhidos.includes(p.id) && p.nome.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busca, produtos, escolhidos]);

  const cel = (p: string, t: string) => grade[p]?.[t] ?? { qtd: "", colabs: [] };

  const setCel = (p: string, t: string, patch: Partial<{ qtd: string; colabs: string[] }>) =>
    setGrade((g) => ({ ...g, [p]: { ...(g[p] ?? {}), [t]: { ...cel(p, t), ...patch } } }));

  const salvar = () => {
    setErro(null);
    const linhas: LinhaEntrada[] = [];
    for (const p of escolhidos) {
      for (const t of turnos) {
        const c = cel(p, t.id);
        const n = Number(c.qtd.replace(",", "."));
        if (c.qtd.trim() && n > 0) {
          linhas.push({ turno_id: t.id, produto_id: p, projetado: n, colaboradores: c.colabs });
        }
      }
    }
    if (linhas.length === 0) {
      setErro("Preencha ao menos uma quantidade antes de salvar.");
      return;
    }
    iniciar(async () => {
      const r = await salvarPlanoAction(data, linhas, obs.trim() || null, tipo);
      if (r.error) return setErro(r.error);
      router.push(`/pcp/${data}${aba}`);
    });
  };

  const apagar = () => {
    if (!confirm(`Apagar a folha de ${rotulo} deste dia? A produção fica sem orientação.`)) return;
    iniciar(async () => {
      const r = await apagarPlanoAction(data, tipo);
      if (r.error) return setErro(r.error);
      router.push('/pcp');
    });
  };

  const totalPlanejado = escolhidos.reduce(
    (s, p) => s + turnos.reduce((a, t) => a + (Number(cel(p, t.id).qtd.replace(",", ".")) || 0), 0),
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="relative">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={tipo === "final" ? "Buscar produto para adicionar à folha..." : "Buscar recheio, massa ou preparo..."}
          className="h-10"
        />
        {candidatos.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg">
            {candidatos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setEscolhidos((e) => [...e, p.id]);
                  setBusca("");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              >
                {temCodigo && <strong className="tabular-nums">{codigoCurto(p.nome)} · </strong>}
                {nomeLimpo(p.nome)}
                {p.unidade && <span className="ml-1 text-xs text-zinc-500">({p.unidade})</span>}
                {p.estoque_seguranca != null && (
                  <span className="ml-2 text-xs text-zinc-500">
                    ideal {Number(p.estoque_seguranca).toLocaleString("pt-BR")}
                    {p.contado != null && ` · tem ${Number(p.contado).toLocaleString("pt-BR")}`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-300 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-100">
              {temCodigo && (
                <th className="border-b-2 border-r border-zinc-300 px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600">Cód.</th>
              )}
              <th className="border-b-2 border-r-2 border-zinc-300 px-2 py-2 text-left text-xs font-bold uppercase text-zinc-600">Produto</th>
              <th className="border-b-2 border-r-2 border-zinc-300 px-2 py-2 text-center text-xs font-bold uppercase text-zinc-600">Situação</th>
              {turnos.map((t) => (
                <th key={t.id} className="border-b-2 border-r-2 border-zinc-300 bg-zinc-800 px-2 py-2 text-center text-white">
                  <div className="text-xs font-bold uppercase">{t.nome}</div>
                  <div className="text-sm font-bold tabular-nums">
                    {hhmm(t.hora_inicio)}–{hhmm(t.hora_fim)}
                  </div>
                </th>
              ))}
              <th className="border-b-2 border-zinc-300 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {escolhidos.map((pid, i) => {
              const p = porId.get(pid);
              if (!p) return null;
              const falta =
                p.estoque_seguranca != null && p.contado != null
                  ? Math.max(0, Number(p.estoque_seguranca) - Number(p.contado))
                  : null;
              return (
                <tr key={pid} className={i % 2 ? "bg-zinc-50/60" : "bg-white"}>
                  {temCodigo && (
                    <td className="border-b border-r border-zinc-200 px-2 py-2">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-zinc-900 px-1.5 text-xs font-bold text-white tabular-nums">
                        {codigoCurto(p.nome)}
                      </span>
                    </td>
                  )}
                  <td className="border-b border-r-2 border-zinc-200 px-2 py-2 font-medium">
                    {nomeLimpo(p.nome)}
                    {p.unidade && <span className="ml-1.5 text-xs font-normal text-zinc-500">{p.unidade}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-r-2 border-zinc-200 px-2 py-2 text-center text-xs text-zinc-600">
                    {p.estoque_seguranca != null ? (
                      <>
                        ideal {Number(p.estoque_seguranca).toLocaleString("pt-BR")}
                        {p.contado != null && (
                          <>
                            {" · "}tem {Number(p.contado).toLocaleString("pt-BR")}
                            {falta != null && falta > 0 && (
                              <strong className="ml-1 text-amber-700">faltam {falta.toLocaleString("pt-BR")}</strong>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {turnos.map((t) => {
                    const c = cel(pid, t.id);
                    const aberto = editandoEquipe?.p === pid && editandoEquipe.t === t.id;
                    return (
                      <td key={t.id} className="relative border-b border-r-2 border-zinc-200 p-1 align-top">
                        <Input
                          value={c.qtd}
                          onChange={(e) => setCel(pid, t.id, { qtd: e.target.value })}
                          inputMode={temCodigo ? "numeric" : "decimal"}
                          placeholder="—"
                          className="h-9 w-full text-center tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setEditandoEquipe(aberto ? null : { p: pid, t: t.id })}
                          className="mt-1 block w-full truncate rounded px-1 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                          title="Definir quem produz"
                        >
                          {c.colabs.length > 0
                            ? c.colabs.map((id) => colaboradores.find((x) => x.id === id)?.nome).join(" / ")
                            : "+ quem faz"}
                        </button>
                        {aberto && (
                          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 shadow-lg">
                            {colaboradores.length === 0 && (
                              <p className="text-xs text-amber-700">
                                Cadastre colaboradores em Configurações.
                              </p>
                            )}
                            {colaboradores.map((col) => {
                              const on = c.colabs.includes(col.id);
                              return (
                                <button
                                  key={col.id}
                                  type="button"
                                  onClick={() =>
                                    setCel(pid, t.id, {
                                      colabs: on
                                        ? c.colabs.filter((x) => x !== col.id)
                                        : [...c.colabs, col.id],
                                    })
                                  }
                                  className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                                    on ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"
                                  }`}
                                >
                                  {col.nome}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => setEditandoEquipe(null)}
                              className="mt-1 w-full rounded border border-zinc-200 py-1 text-xs hover:bg-zinc-50"
                            >
                              fechar
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-zinc-200 px-2 text-center">
                    <button
                      onClick={() => setEscolhidos((e) => e.filter((x) => x !== pid))}
                      className="text-xs text-red-600 hover:underline"
                    >
                      remover
                    </button>
                  </td>
                </tr>
              );
            })}
            {escolhidos.length === 0 && (
              <tr>
                <td colSpan={(temCodigo ? 4 : 3) + turnos.length} className="px-4 py-12 text-center text-zinc-500">
                  Busque acima o que entra na folha de {rotulo} deste dia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">
          Avisos para a produção (aparece em destaque na folha)
        </label>
        <Input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="ex: prioridade para o pedido do Atrio" />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar plano"}
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/pcp/${data}${aba}`)}>Cancelar</Button>
        <span className="text-sm text-zinc-600">
          Total: <strong className="tabular-nums">{totalPlanejado.toLocaleString("pt-BR")}</strong>
        </span>
        <button onClick={apagar} disabled={pendente} className="ml-auto text-sm text-red-600 hover:underline">
          Apagar folha de {rotulo}
        </button>
      </div>
    </div>
  );
}
