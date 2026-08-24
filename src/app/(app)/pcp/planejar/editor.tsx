"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { codigoCurto, nomeLimpo } from "../lib";
import { salvarPCPAction, apagarPCPAction, type TurnoEntrada } from "./actions";

export type ProdutoOpt = {
  id: string;
  nome: string;
  estoque_seguranca: number | null;
  contado: number | null;
};
export type ColabOpt = { id: string; nome: string };

type LinhaUI = { _k: string; produto_id: string; quantidade: string };
type TurnoUI = {
  _k: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  colaboradores: string[];
  linhas: LinhaUI[];
};

const chave = () => Math.random().toString(36).slice(2, 9);

const turnoVazio = (n: number): TurnoUI => ({
  _k: chave(),
  nome: `${n}º turno`,
  hora_inicio: n === 1 ? "08:15" : "09:30",
  hora_fim: n === 1 ? "09:15" : "10:30",
  colaboradores: [],
  linhas: [{ _k: chave(), produto_id: "", quantidade: "" }],
});

export function EditorPCP({
  data,
  produtos,
  colaboradores,
  inicial,
  obsInicial,
}: {
  data: string;
  produtos: ProdutoOpt[];
  colaboradores: ColabOpt[];
  inicial: TurnoUI[] | null;
  obsInicial: string;
}) {
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoUI[]>(inicial ?? [turnoVazio(1), turnoVazio(2)]);
  const [obs, setObs] = useState(obsInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const alterar = (k: string, patch: Partial<TurnoUI>) =>
    setTurnos((ts) => ts.map((t) => (t._k === k ? { ...t, ...patch } : t)));

  const alterarLinha = (tk: string, lk: string, patch: Partial<LinhaUI>) =>
    setTurnos((ts) =>
      ts.map((t) =>
        t._k === tk
          ? { ...t, linhas: t.linhas.map((l) => (l._k === lk ? { ...l, ...patch } : l)) }
          : t
      )
    );

  const salvar = () => {
    setErro(null);
    const payload: TurnoEntrada[] = turnos.map((t) => ({
      nome: t.nome,
      hora_inicio: t.hora_inicio,
      hora_fim: t.hora_fim,
      colaboradores: t.colaboradores,
      linhas: t.linhas
        .filter((l) => l.produto_id && Number(l.quantidade.replace(",", ".")) > 0)
        .map((l) => ({
          produto_id: l.produto_id,
          quantidade: Number(l.quantidade.replace(",", ".")),
        })),
    }));
    iniciar(async () => {
      const r = await salvarPCPAction(data, payload, obs.trim() || null);
      if (r.error) return setErro(r.error);
      router.push(`/pcp?data=${data}`);
    });
  };

  const apagar = () => {
    if (!confirm("Apagar o plano deste dia? O painel da produção fica sem orientação.")) return;
    iniciar(async () => {
      const r = await apagarPCPAction(data);
      if (r.error) return setErro(r.error);
      router.push(`/pcp?data=${data}`);
    });
  };

  const totalDia = turnos.reduce(
    (s, t) => s + t.linhas.reduce((a, l) => a + (Number(l.quantidade.replace(",", ".")) || 0), 0),
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {turnos.map((t, i) => (
        <section key={t._k} className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Turno</label>
              <Input
                value={t.nome}
                onChange={(e) => alterar(t._k, { nome: e.target.value })}
                className="h-9 w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Início</label>
              <Input
                type="time"
                value={t.hora_inicio}
                onChange={(e) => alterar(t._k, { hora_inicio: e.target.value })}
                className="h-9 w-32"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Fim</label>
              <Input
                type="time"
                value={t.hora_fim}
                onChange={(e) => alterar(t._k, { hora_fim: e.target.value })}
                className="h-9 w-32"
              />
            </div>
            {turnos.length > 1 && (
              <button
                onClick={() => setTurnos((ts) => ts.filter((x) => x._k !== t._k))}
                className="ml-auto text-sm text-red-600 hover:underline"
              >
                remover turno
              </button>
            )}
          </div>

          <div className="border-b border-zinc-100 p-4">
            <p className="mb-2 text-xs font-medium text-zinc-600">Quem produz</p>
            {colaboradores.length === 0 ? (
              <p className="text-sm text-amber-700">
                Nenhum colaborador cadastrado. Cadastre em Configurações → Colaboradores.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {colaboradores.map((c) => {
                  const on = t.colaboradores.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        alterar(t._k, {
                          colaboradores: on
                            ? t.colaboradores.filter((x) => x !== c.id)
                            : [...t.colaboradores, c.id],
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {c.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 p-4">
            <p className="text-xs font-medium text-zinc-600">O que produzir</p>
            {t.linhas.map((l) => {
              const p = produtos.find((x) => x.id === l.produto_id);
              // Contagem abaixo do ideal indica o tamanho do buraco — a
              // engenheira decide, mas não precisa fazer a conta de cabeça.
              const falta =
                p?.estoque_seguranca != null && p.contado != null
                  ? Math.max(0, Number(p.estoque_seguranca) - Number(p.contado))
                  : null;
              return (
                <div key={l._k} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={l.produto_id}
                    onChange={(e) => alterarLinha(t._k, l._k, { produto_id: e.target.value })}
                    className="h-9 min-w-[240px] flex-1"
                  >
                    <option value="">— escolha o produto —</option>
                    {produtos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={l.quantidade}
                    onChange={(e) => alterarLinha(t._k, l._k, { quantidade: e.target.value })}
                    inputMode="decimal"
                    placeholder="qtd"
                    className="h-9 w-28 text-right tabular-nums"
                  />
                  {p && (
                    <span className="whitespace-nowrap text-xs text-zinc-500">
                      ideal {Number(p.estoque_seguranca ?? 0).toLocaleString("pt-BR")}
                      {p.contado != null && ` · contado ${Number(p.contado).toLocaleString("pt-BR")}`}
                      {falta != null && falta > 0 && (
                        <strong className="ml-1 text-amber-700">faltam {falta.toLocaleString("pt-BR")}</strong>
                      )}
                    </span>
                  )}
                  <button
                    onClick={() =>
                      setTurnos((ts) =>
                        ts.map((x) =>
                          x._k === t._k
                            ? { ...x, linhas: x.linhas.filter((y) => y._k !== l._k) }
                            : x
                        )
                      )
                    }
                    className="text-xs text-red-600 hover:underline"
                  >
                    remover
                  </button>
                </div>
              );
            })}
            <button
              onClick={() =>
                alterar(t._k, {
                  linhas: [...t.linhas, { _k: chave(), produto_id: "", quantidade: "" }],
                })
              }
              className="self-start rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50"
            >
              + produto
            </button>
          </div>
        </section>
      ))}

      <button
        onClick={() => setTurnos((ts) => [...ts, turnoVazio(ts.length + 1)])}
        className="self-start rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
      >
        + adicionar turno
      </button>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">
          Avisos para a produção (aparece em destaque no painel)
        </label>
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          maxLength={200}
          placeholder="ex: prioridade para o pedido do Atrio"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar plano"}
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/pcp?data=${data}`)}>
          Cancelar
        </Button>
        <span className="text-sm text-zinc-600">
          Total do dia: <strong className="tabular-nums">{totalDia.toLocaleString("pt-BR")}</strong>
        </span>
        <button onClick={apagar} disabled={pendente} className="ml-auto text-sm text-red-600 hover:underline">
          Apagar plano do dia
        </button>
      </div>
    </div>
  );
}

export { codigoCurto, nomeLimpo };
