"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { codigoCurto, desvioClasse, hhmm, nomeLimpo, situacaoTurno, type SituacaoTurno } from "./lib";
import { lancarRealizadoAction } from "./actions";

export type ItemTurno = {
  linha_id: string;
  produto: string;
  projetado: number;
  realizado: number | null;
  colaboradores: string[];
};
export type BlocoTurno = {
  id: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  itens: ItemTurno[];
};

/**
 * A folha do PCP: os turnos são blocos empilhados, cada um com os produtos
 * daquele horário logo abaixo.
 *
 * Turno em coluna obrigava rolar a tela pro lado — numa tela pendurada na
 * parede ninguém rola. Empilhado, cada bloco é lido de cima pra baixo e o
 * turno corrente aparece verde e destacado no meio da sequência.
 */
export function FolhaPCP({
  data,
  blocos,
  podeLancar,
}: {
  data: string;
  blocos: BlocoTurno[];
  podeLancar: boolean;
}) {
  const [agora, setAgora] = useState<Date | null>(null);

  // Só no cliente: hora vinda do servidor daria divergência de hidratação e
  // destacaria o turno errado no primeiro render.
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Mudança feita no planejamento chega ao monitor sem ninguém apertar F5.
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const todos = blocos.flatMap((b) => b.itens);
  const totalProj = todos.reduce((s, i) => s + i.projetado, 0);
  const totalReal = todos.reduce((s, i) => s + (i.realizado ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Plano de produção
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{data}</h1>
        </div>
        <div className="flex items-end gap-8">
          <Kpi rotulo="Projetado" valor={totalProj} />
          <Kpi rotulo="Realizado" valor={totalReal} destaque />
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Agora</p>
            <p className="text-3xl font-bold tabular-nums">
              {agora
                ? `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`
                : "--:--"}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {blocos.map((b) => (
          <BlocoDeTurno
            key={b.id}
            bloco={b}
            situacao={agora ? situacaoTurno(b.hora_inicio, b.hora_fim, agora) : "proximo"}
            podeLancar={podeLancar}
          />
        ))}
        {blocos.length === 0 && (
          <div className="rounded-xl border border-zinc-300 bg-white px-4 py-16 text-center text-zinc-500">
            Nenhum produto planejado para este dia.
          </div>
        )}
      </div>
    </div>
  );
}

function BlocoDeTurno({
  bloco,
  situacao,
  podeLancar,
}: {
  bloco: BlocoTurno;
  situacao: SituacaoTurno;
  podeLancar: boolean;
}) {
  const proj = bloco.itens.reduce((s, i) => s + i.projetado, 0);
  const real = bloco.itens.reduce((s, i) => s + (i.realizado ?? 0), 0);
  const lancouAlgum = bloco.itens.some((i) => i.realizado !== null);

  const moldura =
    situacao === "agora"
      ? "border-emerald-500 shadow-lg shadow-emerald-100"
      : situacao === "encerrado"
        ? "border-zinc-200"
        : "border-zinc-300";
  const faixa =
    situacao === "agora"
      ? "bg-emerald-500 text-white"
      : situacao === "encerrado"
        ? "bg-zinc-200 text-zinc-500"
        : "bg-zinc-800 text-white";

  return (
    <section
      className={`overflow-hidden rounded-xl border-2 bg-white ${moldura} ${
        situacao === "encerrado" ? "opacity-70" : ""
      }`}
    >
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${faixa}`}>
        <span className="text-lg font-bold uppercase tracking-wider">{bloco.nome}</span>
        <span className="text-2xl font-bold tabular-nums">
          {hhmm(bloco.hora_inicio)} – {hhmm(bloco.hora_fim)}
        </span>
        {situacao === "agora" && (
          <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold tracking-[0.2em]">
            AGORA
          </span>
        )}
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {proj.toLocaleString("pt-BR")} projetado
          {lancouAlgum && <> · {real.toLocaleString("pt-BR")} feito</>}
        </span>
      </div>

      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <th className="w-14 border-b border-zinc-200 px-3 py-1 text-left">Cód.</th>
            <th className="border-b border-zinc-200 px-3 py-1 text-left">Produto</th>
            <th className="w-32 border-b border-zinc-200 px-2 py-1 text-center">Projetado</th>
            <th className="w-32 border-b border-zinc-200 px-2 py-1 text-center">Realizado</th>
            <th className="w-56 border-b border-zinc-200 px-3 py-1 text-left">Colaborador</th>
          </tr>
        </thead>
        <tbody>
          {bloco.itens.map((i, idx) => (
            <tr key={i.linha_id} className={idx % 2 ? "bg-zinc-50/60" : "bg-white"}>
              <td className="border-b border-zinc-200 px-3 py-2">
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded bg-zinc-900 px-2 text-sm font-bold tabular-nums text-white">
                  {codigoCurto(i.produto)}
                </span>
              </td>
              <td className="border-b border-zinc-200 px-3 py-2 text-lg font-semibold leading-tight">
                {nomeLimpo(i.produto)}
              </td>
              <td className="border-b border-zinc-200 px-2 py-2 text-center text-2xl font-bold tabular-nums">
                {i.projetado.toLocaleString("pt-BR")}
              </td>
              <td className="border-b border-zinc-200 px-1 py-1 text-center">
                <CampoRealizado item={i} podeLancar={podeLancar} />
              </td>
              <td className="border-b border-zinc-200 px-3 py-2 text-sm leading-tight text-zinc-700">
                {i.colaboradores.join(" / ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** O realizado é lançado na própria folha, durante o turno. */
function CampoRealizado({ item, podeLancar }: { item: ItemTurno; podeLancar: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(item.realizado === null ? "" : String(item.realizado));
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(false);

  const cor = desvioClasse(item.projetado, item.realizado);

  if (!podeLancar) {
    return (
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>
        {item.realizado === null ? "—" : item.realizado.toLocaleString("pt-BR")}
      </span>
    );
  }

  const salvar = () => {
    const limpo = valor.trim().replace(",", ".");
    const n = limpo === "" ? null : Number(limpo);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setErro(true);
      return;
    }
    if (n === item.realizado) return;
    setErro(false);
    iniciar(async () => {
      const r = await lancarRealizadoAction(item.linha_id, n);
      if (r.error) setErro(true);
      else router.refresh();
    });
  };

  return (
    <input
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode="numeric"
      disabled={pendente}
      placeholder="—"
      className={`h-11 w-full rounded border-2 bg-white/70 text-center text-2xl font-bold tabular-nums outline-none transition-colors focus:border-zinc-900 focus:bg-white ${
        erro ? "border-red-400" : "border-transparent hover:border-zinc-300"
      } ${cor}`}
    />
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{rotulo}</p>
      <p className={`text-3xl font-bold tabular-nums ${destaque ? "text-emerald-700" : "text-zinc-900"}`}>
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
