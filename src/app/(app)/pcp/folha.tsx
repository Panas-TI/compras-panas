"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { codigoCurto, desvioClasse, hhmm, nomeLimpo, situacaoTurno, type SituacaoTurno } from "./lib";
import { lancarRealizadoAction } from "./actions";

export type TurnoCol = { id: string; nome: string; hora_inicio: string; hora_fim: string };
export type Celula = {
  linha_id: string;
  projetado: number;
  realizado: number | null;
  colaboradores: string[];
};
export type LinhaProduto = {
  produto_id: string;
  produto: string;
  /** turno_id → célula */
  celulas: Record<string, Celula>;
};

/**
 * A folha do PCP, no mesmo desenho do papel que a produção já usa:
 * produtos nas linhas, turnos nas colunas, e em cada cruzamento o projetado,
 * o realizado e quem fez.
 *
 * A coluna do turno corrente fica destacada. Numa tela pendurada na parede é
 * o que evita a colaboradora ter que achar a coluna certa entre seis.
 */
export function FolhaPCP({
  data,
  turnos,
  linhas,
  podeLancar,
}: {
  data: string;
  turnos: TurnoCol[];
  linhas: LinhaProduto[];
  podeLancar: boolean;
}) {
  const [agora, setAgora] = useState<Date | null>(null);

  // Só no cliente: hora vinda do servidor daria divergência de hidratação e
  // destacaria a coluna errada no primeiro render.
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

  const sit = (t: TurnoCol): SituacaoTurno =>
    agora ? situacaoTurno(t.hora_inicio, t.hora_fim, agora) : "proximo";

  const totalProj = linhas.reduce(
    (s, l) => s + Object.values(l.celulas).reduce((a, c) => a + c.projetado, 0),
    0
  );
  const totalReal = linhas.reduce(
    (s, l) => s + Object.values(l.celulas).reduce((a, c) => a + (c.realizado ?? 0), 0),
    0
  );

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

      <div className="overflow-x-auto rounded-xl border border-zinc-300 bg-white">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b-2 border-r border-zinc-300 bg-zinc-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-zinc-600">
                Cód.
              </th>
              <th className="sticky left-[52px] z-10 border-b-2 border-r-2 border-zinc-300 bg-zinc-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-zinc-600">
                Produto
              </th>
              {turnos.map((t) => {
                const s = sit(t);
                return (
                  <th
                    key={t.id}
                    colSpan={3}
                    className={`border-b-2 border-r-2 border-zinc-300 px-2 py-2 text-center ${
                      s === "agora"
                        ? "bg-emerald-500 text-white"
                        : s === "encerrado"
                          ? "bg-zinc-200 text-zinc-500"
                          : "bg-zinc-800 text-white"
                    }`}
                  >
                    <div className="text-sm font-bold uppercase tracking-wider">{t.nome}</div>
                    <div className="text-lg font-bold tabular-nums">
                      {hhmm(t.hora_inicio)} – {hhmm(t.hora_fim)}
                    </div>
                    {s === "agora" && (
                      <div className="text-[10px] font-bold tracking-[0.2em]">AGORA</div>
                    )}
                  </th>
                );
              })}
            </tr>
            <tr className="bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="sticky left-0 z-10 border-b border-r border-zinc-300 bg-zinc-50" />
              <th className="sticky left-[52px] z-10 border-b border-r-2 border-zinc-300 bg-zinc-50" />
              {turnos.map((t) => (
                <FragmentoCabecalho key={t.id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.produto_id} className={i % 2 ? "bg-zinc-50/60" : "bg-white"}>
                <td className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-inherit px-3 py-2">
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded bg-zinc-900 px-2 text-sm font-bold text-white tabular-nums">
                    {codigoCurto(l.produto)}
                  </span>
                </td>
                <td className="sticky left-[52px] z-10 border-b border-r-2 border-zinc-200 bg-inherit px-3 py-2 text-lg font-semibold leading-tight">
                  {nomeLimpo(l.produto)}
                </td>
                {turnos.map((t) => (
                  <CelulaTurno
                    key={t.id}
                    celula={l.celulas[t.id]}
                    destaque={sit(t) === "agora"}
                    podeLancar={podeLancar}
                  />
                ))}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={2 + turnos.length * 3} className="px-4 py-16 text-center text-zinc-500">
                  Nenhum produto planejado para este dia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentoCabecalho() {
  return (
    <>
      <th className="border-b border-r border-zinc-200 px-2 py-1 text-center">Projetado</th>
      <th className="border-b border-r border-zinc-200 px-2 py-1 text-center">Realizado</th>
      <th className="border-b border-r-2 border-zinc-300 px-2 py-1 text-center">Colaborador</th>
    </>
  );
}

function CelulaTurno({
  celula,
  destaque,
  podeLancar,
}: {
  celula: Celula | undefined;
  destaque: boolean;
  podeLancar: boolean;
}) {
  const fundo = destaque ? "bg-emerald-50/70" : "";
  if (!celula) {
    return (
      <>
        <td className={`border-b border-r border-zinc-200 ${fundo}`} />
        <td className={`border-b border-r border-zinc-200 ${fundo}`} />
        <td className={`border-b border-r-2 border-zinc-300 ${fundo}`} />
      </>
    );
  }
  return (
    <>
      <td className={`border-b border-r border-zinc-200 px-2 py-2 text-center text-2xl font-bold tabular-nums ${fundo}`}>
        {celula.projetado.toLocaleString("pt-BR")}
      </td>
      <td className={`border-b border-r border-zinc-200 px-1 py-1 text-center ${fundo}`}>
        <CampoRealizado celula={celula} podeLancar={podeLancar} />
      </td>
      <td className={`border-b border-r-2 border-zinc-300 px-2 py-2 text-center text-sm leading-tight text-zinc-700 ${fundo}`}>
        {celula.colaboradores.join(" / ") || "—"}
      </td>
    </>
  );
}

/** O realizado é lançado na própria folha, durante o turno. */
function CampoRealizado({ celula, podeLancar }: { celula: Celula; podeLancar: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(celula.realizado === null ? "" : String(celula.realizado));
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(false);

  const cor = desvioClasse(celula.projetado, celula.realizado);

  if (!podeLancar) {
    return (
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>
        {celula.realizado === null ? "—" : celula.realizado.toLocaleString("pt-BR")}
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
    if (n === celula.realizado) return;
    setErro(false);
    iniciar(async () => {
      const r = await lancarRealizadoAction(celula.linha_id, n);
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
