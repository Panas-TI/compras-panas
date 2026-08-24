"use client";

import { useEffect, useState } from "react";
import { codigoCurto, hhmm, nomeLimpo, situacaoTurno, type SituacaoTurno } from "./lib";

export type LinhaPCP = { produto: string; quantidade: number };
export type TurnoPCP = {
  id: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  colaboradores: string[];
  linhas: LinhaPCP[];
};

const ESTILO: Record<SituacaoTurno, { card: string; faixa: string; rotulo: string | null }> = {
  agora: {
    card: "border-emerald-400 bg-white shadow-lg ring-2 ring-emerald-200",
    faixa: "bg-emerald-500 text-white",
    rotulo: "AGORA",
  },
  proximo: {
    card: "border-zinc-200 bg-white",
    faixa: "bg-zinc-800 text-white",
    rotulo: "A SEGUIR",
  },
  encerrado: {
    card: "border-zinc-200 bg-zinc-50 opacity-60",
    faixa: "bg-zinc-400 text-white",
    rotulo: null,
  },
};

/**
 * Painel espelhado no monitor da produção.
 *
 * Tudo aqui é dimensionado pra leitura a alguns metros de distância: número da
 * quantidade em display, código do produto como etiqueta, e o turno corrente
 * destacado em verde. O relógio atualiza sozinho pra que o destaque acompanhe
 * o dia sem ninguém tocar na tela.
 */
export function PainelPCP({ turnos, data }: { turnos: TurnoPCP[]; data: string }) {
  // Começa nulo e só preenche no cliente: renderizar hora no servidor daria
  // divergência de hidratação e um destaque errado no primeiro segundo.
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Recarrega de tempos em tempos pra pegar mudança feita no planejamento sem
  // alguém precisar ir até o monitor apertar F5.
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const totalDia = turnos.reduce(
    (s, t) => s + t.linhas.reduce((a, l) => a + Number(l.quantidade), 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Plano de produção
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">{data}</h1>
        </div>
        <div className="flex items-end gap-8">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total do dia</p>
            <p className="text-4xl font-bold tabular-nums text-zinc-900">
              {totalDia.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Agora</p>
            <p className="text-4xl font-bold tabular-nums text-zinc-900">
              {agora
                ? `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`
                : "--:--"}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {turnos.map((t) => {
          const sit: SituacaoTurno = agora
            ? situacaoTurno(t.hora_inicio, t.hora_fim, agora)
            : "proximo";
          const e = ESTILO[sit];
          const total = t.linhas.reduce((a, l) => a + Number(l.quantidade), 0);

          return (
            <section
              key={t.id}
              className={`overflow-hidden rounded-2xl border-2 transition-all ${e.card}`}
            >
              <div className={`flex items-center justify-between px-6 py-4 ${e.faixa}`}>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider opacity-90">
                    {t.nome}
                  </p>
                  <p className="text-3xl font-bold tabular-nums">
                    {hhmm(t.hora_inicio)} – {hhmm(t.hora_fim)}
                  </p>
                </div>
                {e.rotulo && (
                  <span className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold tracking-widest">
                    {e.rotulo}
                  </span>
                )}
              </div>

              {t.colaboradores.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-6 py-3">
                  {t.colaboradores.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-lg font-medium text-zinc-800"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <div className="divide-y divide-zinc-100">
                {t.linhas.map((l) => {
                  const cod = codigoCurto(l.produto);
                  return (
                    <div key={l.produto} className="flex items-center gap-4 px-6 py-4">
                      {cod && (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xl font-bold text-white tabular-nums">
                          {cod}
                        </span>
                      )}
                      <span className="flex-1 text-2xl font-semibold leading-tight text-zinc-900">
                        {nomeLimpo(l.produto)}
                      </span>
                      <span className="text-4xl font-bold tabular-nums text-zinc-900">
                        {Number(l.quantidade).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  );
                })}
                {t.linhas.length === 0 && (
                  <p className="px-6 py-8 text-center text-lg text-zinc-400">
                    Sem produção definida neste turno.
                  </p>
                )}
              </div>

              {total > 0 && (
                <div className="flex items-center justify-between bg-zinc-50 px-6 py-3">
                  <span className="text-sm font-medium uppercase tracking-wider text-zinc-500">
                    Total do turno
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-zinc-900">
                    {total.toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
