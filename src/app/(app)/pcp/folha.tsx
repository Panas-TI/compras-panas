"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { codigoCurto, desvioClasse, hhmm, nomeLimpo, situacaoTurno, type SituacaoTurno } from "./lib";
import { lancarRealizadoAction } from "./actions";

export type LinhaFolha = {
  linha_id: string;
  produto: string;
  projetado: number;
  realizado: number | null;
  colaboradores: string[];
  /** KG, L, UN… vazio nos acabados, que são contados em unidades. */
  unidade: string | null;
  turno_id: string;
  turno_nome: string;
  hora_inicio: string;
  hora_fim: string;
};

/**
 * A folha do PCP: uma linha por produto, e o turno dele na coluna da direita.
 *
 * Turno em coluna repetia Projetado/Realizado/Colaborador seis vezes e jogava
 * os últimos turnos pra fora da tela. Numa tela pendurada na parede ninguém
 * rola pro lado — então o que sai da vista deixa de existir.
 */
export function FolhaPCP({
  data,
  subtitulo,
  linhas,
  podeLancar,
  mostrarCodigo = true,
}: {
  data: string;
  subtitulo?: string;
  linhas: LinhaFolha[];
  podeLancar: boolean;
  /** Recheio e massa não têm código numérico: a coluna sairia só com traços. */
  mostrarCodigo?: boolean;
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
  // router.refresh() e não location.reload(): recarregar a página derrubaria
  // o modo TV da tela cheia a cada cinco minutos.
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60_000);
    return () => clearInterval(t);
  }, [router]);

  const totalProj = linhas.reduce((s, l) => s + l.projetado, 0);
  const totalReal = linhas.reduce((s, l) => s + (l.realizado ?? 0), 0);

  const sit = (l: LinhaFolha): SituacaoTurno =>
    agora ? situacaoTurno(l.hora_inicio, l.hora_fim, agora) : "proximo";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {subtitulo ?? "Plano de produção"}
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
            <tr className="bg-zinc-100 text-xs font-bold uppercase tracking-wider text-zinc-600">
              {mostrarCodigo && (
                <th className="w-16 border-b-2 border-r border-zinc-300 px-3 py-2 text-left">Cód.</th>
              )}
              <th className="border-b-2 border-r-2 border-zinc-300 px-3 py-2 text-left">Produto</th>
              <th className="w-36 border-b-2 border-r border-zinc-300 px-2 py-2 text-center">
                Projetado
              </th>
              <th className="w-36 border-b-2 border-r border-zinc-300 px-2 py-2 text-center">
                Realizado
              </th>
              <th className="w-64 border-b-2 border-r-2 border-zinc-300 px-3 py-2 text-left">
                Colaborador
              </th>
              <th className="w-52 border-b-2 border-zinc-300 px-3 py-2 text-center">Turno</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const s = sit(l);
              // A célula do turno é mesclada com rowSpan: um bloco só cobrindo
              // todas as linhas daquele turno, em vez de repetir a etiqueta.
              const primeira = i === 0 || linhas[i - 1].turno_id !== l.turno_id;
              const doTurno = linhas.filter((x) => x.turno_id === l.turno_id);
              const ultima = i === linhas.length - 1 || linhas[i + 1].turno_id !== l.turno_id;
              // A linha inteira acende no turno corrente: de longe, é o que diz
              // à colaboradora quais produtos são os de agora.
              const fundo =
                s === "agora" ? "bg-emerald-50" : i % 2 ? "bg-zinc-50/60" : "bg-white";
              const fecha = ultima ? "border-b-2 border-zinc-300" : "border-b border-zinc-200";
              return (
                <tr key={l.linha_id} className={fundo}>
                  {mostrarCodigo && (
                    <td className={`border-r border-zinc-200 px-3 py-2 ${fecha}`}>
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded bg-zinc-900 px-2 text-sm font-bold tabular-nums text-white">
                        {codigoCurto(l.produto)}
                      </span>
                    </td>
                  )}
                  <td className={`border-r-2 border-zinc-200 px-3 py-2 text-lg font-semibold leading-tight ${fecha}`}>
                    {nomeLimpo(l.produto)}
                    {l.unidade && (
                      <span className="ml-1.5 text-sm font-normal text-zinc-500">{l.unidade}</span>
                    )}
                  </td>
                  <td className={`border-r border-zinc-200 px-2 py-2 text-center text-2xl font-bold tabular-nums ${fecha}`}>
                    {l.projetado.toLocaleString("pt-BR")}
                  </td>
                  <td className={`border-r border-zinc-200 px-1 py-1 text-center ${fecha}`}>
                    <CampoRealizado linha={l} podeLancar={podeLancar} />
                  </td>
                  <td className={`border-r-2 border-zinc-200 px-3 py-2 text-sm leading-tight text-zinc-700 ${fecha}`}>
                    {l.colaboradores.join(" / ") || "—"}
                  </td>
                  {primeira && (
                    <td
                      rowSpan={doTurno.length}
                      className="border-b-2 border-zinc-300 p-1.5 align-middle"
                    >
                      <BlocoTurno linhas={doTurno} situacao={s} />
                    </td>
                  )}
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={mostrarCodigo ? 6 : 5} className="px-4 py-16 text-center text-zinc-500">
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

function BlocoTurno({ linhas, situacao }: { linhas: LinhaFolha[]; situacao: SituacaoTurno }) {
  const cor =
    situacao === "agora"
      ? "bg-emerald-500 text-white"
      : situacao === "encerrado"
        ? "bg-zinc-200 text-zinc-500"
        : "bg-zinc-800 text-white";
  const proj = linhas.reduce((s, l) => s + l.projetado, 0);
  const real = linhas.reduce((s, l) => s + (l.realizado ?? 0), 0);
  const lancouAlgum = linhas.some((l) => l.realizado !== null);
  const t = linhas[0];

  return (
    <div className={`flex h-full flex-col items-center justify-center rounded-lg px-2 py-3 ${cor}`}>
      <div className="text-xs font-bold uppercase tracking-wider">{t.turno_nome}</div>
      <div className="text-xl font-bold tabular-nums">
        {hhmm(t.hora_inicio)} – {hhmm(t.hora_fim)}
      </div>
      {situacao === "agora" && (
        <div className="mt-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em]">
          AGORA
        </div>
      )}
      {/* Placar do próprio turno: sem isso a colaboradora somaria de cabeça. */}
      <div className="mt-2 text-[11px] font-medium tabular-nums opacity-80">
        {proj.toLocaleString("pt-BR")} projetado
        {lancouAlgum && <> · {real.toLocaleString("pt-BR")} feito</>}
      </div>
    </div>
  );
}

/** O realizado é lançado na própria folha, durante o turno. */
function CampoRealizado({ linha, podeLancar }: { linha: LinhaFolha; podeLancar: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(linha.realizado === null ? "" : String(linha.realizado));
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(false);

  const cor = desvioClasse(linha.projetado, linha.realizado);

  if (!podeLancar) {
    return (
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>
        {linha.realizado === null ? "—" : linha.realizado.toLocaleString("pt-BR")}
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
    if (n === linha.realizado) return;
    setErro(false);
    iniciar(async () => {
      const r = await lancarRealizadoAction(linha.linha_id, n);
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
