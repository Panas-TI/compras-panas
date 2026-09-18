import { createClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { coberturaVendas } from "./cobertura";
import { diaEmSP } from "./contato-regras";

/** Meta semanal da empresa — conta toda venda, não só a provocada por contato. */
const META_SEMANAL = 45000;

/** Segunda-feira da semana da data informada. */
function segundaDa(d: Date): Date {
  const s = new Date(d);
  const dia = s.getDay();
  s.setDate(s.getDate() - (dia === 0 ? 6 : dia - 1));
  s.setHours(0, 0, 0, 0);
  return s;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Placar da semana contra a meta.
 *
 * Sem isto o vendedor trabalhava sem saber se o dia rendeu — e a meta só era
 * conferida no fim do mês, quando já não dava pra reagir. Mostra o ritmo
 * necessário pro que sobrou da semana, não só o total.
 */
export async function PlacarMeta() {
  const supabase = await createClient();
  const cobertura = await coberturaVendas();
  const hoje = new Date();
  const inicio = segundaDa(hoje);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);

  /**
   * O mês fecha a leitura que a semana sozinha não dá.
   *
   * A semana oscila com feriado e com pedido grande que cai numa quarta; o
   * acumulado do mês contra o mesmo período do mês anterior mostra se o
   * movimento é tendência ou oscilação. Comparar com o mês INTEIRO anterior
   * seria injusto no dia 18 — por isso o corte é no mesmo dia.
   */
  const hojeSP = diaEmSP(hoje);
  const [ano, mes, diaDoMes] = hojeSP.split("-").map(Number);
  const dd = (n: number) => String(n).padStart(2, "0");
  const inicioMes = `${ano}-${dd(mes)}-01`;
  const anteriorEm = new Date(Date.UTC(ano, mes - 2, 1));
  const anoAnt = anteriorEm.getUTCFullYear();
  const mesAnt = anteriorEm.getUTCMonth() + 1;
  const ultimoDiaAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
  const inicioAnt = `${anoAnt}-${dd(mesAnt)}-01`;
  const fimAnt = `${anoAnt}-${dd(mesAnt)}-${dd(Math.min(diaDoMes, ultimoDiaAnt))}`;

  const [{ data }, { data: doMes }, { data: doMesAnterior }] = await Promise.all([
    supabase
      .from("vendas_pedidos")
      .select("total, data, atendente")
      .gte("data", iso(inicio))
      .lte("data", iso(fim))
      .eq("eh_valido", true),
    supabase
      .from("vendas_pedidos")
      .select("total")
      .gte("data", inicioMes)
      .lte("data", hojeSP)
      .eq("eh_valido", true)
      .limit(5000),
    supabase
      .from("vendas_pedidos")
      .select("total")
      .gte("data", inicioAnt)
      .lte("data", fimAnt)
      .eq("eh_valido", true)
      .limit(5000),
  ]);

  const vendidoMes = (doMes ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0);
  const vendidoMesAnterior = (doMesAnterior ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0);
  const variacao =
    vendidoMesAnterior > 0
      ? Math.round(((vendidoMes - vendidoMesAnterior) / vendidoMesAnterior) * 100)
      : null;
  const nomeDoMes = (m: number, a: number) =>
    new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  const vendido = (data ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0);
  const falta = Math.max(0, META_SEMANAL - vendido);
  const pct = Math.min(100, (vendido / META_SEMANAL) * 100);
  const bateu = vendido >= META_SEMANAL;

  // Dias úteis restantes, contando hoje. Sábado e domingo ficam de fora.
  let uteis = 0;
  const d = new Date(hoje);
  d.setHours(0, 0, 0, 0);
  while (d <= fim) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) uteis++;
    d.setDate(d.getDate() + 1);
  }

  const porDia = uteis > 0 ? falta / uteis : falta;
  const ticket =
    (data ?? []).length > 0 ? vendido / (data ?? []).length : 440;
  const pedidosPorDia = ticket > 0 ? Math.ceil(porDia / ticket) : 0;

  // Quem vendeu o quê nesta semana.
  const porAtendente = new Map<string, number>();
  for (const p of data ?? []) {
    if (!p.atendente) continue;
    porAtendente.set(p.atendente, (porAtendente.get(p.atendente) ?? 0) + Number(p.total ?? 0));
  }
  const ranking = Array.from(porAtendente.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">
            Semana {iso(inicio).slice(8, 10)}/{iso(inicio).slice(5, 7)} a{" "}
            {iso(fim).slice(8, 10)}/{iso(fim).slice(5, 7)}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrencyBRL(vendido)}{" "}
            <span className="text-base font-normal text-zinc-400">
              de {formatCurrencyBRL(META_SEMANAL)}
            </span>
          </p>
          {/* Sem isto o placar anuncia o total da semana como se a semana
              estivesse inteira aqui. Quem comparasse com o ERP acharia que o
              sistema perde venda — foi o que aconteceu: R$ 32.449,95 lá contra
              R$ 22.774,45 aqui, e a diferença era um dia que nunca chegou. */}
          {cobertura.ate && (
            <p className="text-xs text-zinc-500">
              por data de lançamento · até{" "}
              <strong className="text-zinc-700">{formatDateBR(cobertura.ate)}</strong>
              {/* Hoje em aberto é o normal — nota, não alarme. Dia anterior
                  faltando é atraso de verdade, e aí sim chama atenção. */}
              {cobertura.faltaHoje && cobertura.diasEmFalta.length === 0 && (
                <span className="text-zinc-400"> · a venda de hoje entra amanhã</span>
              )}
              {cobertura.diasEmFalta.length > 0 && (
                <span className="text-amber-700">
                  {" "}
                  · {cobertura.diasEmFalta.length === 1
                    ? `${formatDateBR(cobertura.diasEmFalta[0])} não entrou`
                    : `${cobertura.diasEmFalta.length} dias úteis não entraram`}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="text-right text-sm">
          {bateu ? (
            <p className="font-medium text-emerald-700">Meta semanal atingida</p>
          ) : (
            <>
              <p className="text-zinc-600">
                Faltam{" "}
                <strong className="tabular-nums text-zinc-900">{formatCurrencyBRL(falta)}</strong>{" "}
                para a meta semanal
              </p>
              <p className="text-xs text-zinc-500">
                {uteis} {uteis === 1 ? "dia útil restante" : "dias úteis restantes"} · ritmo
                necessário de {formatCurrencyBRL(porDia)} por dia, cerca de {pedidosPorDia}{" "}
                {pedidosPorDia === 1 ? "pedido" : "pedidos"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${
            bateu ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-zinc-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Acumulado do mês. Vem depois da semana porque a decisão do dia é
          semanal; o mês serve para saber se o mês está no rumo. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-zinc-100 pt-3">
        <p className="text-sm text-zinc-600">
          Acumulado de {nomeDoMes(mes, ano)}{" "}
          <strong className="tabular-nums text-zinc-900">{formatCurrencyBRL(vendidoMes)}</strong>
          <span className="text-zinc-400"> · {(doMes ?? []).length} pedidos</span>
        </p>
        {vendidoMesAnterior > 0 && (
          <p className="text-xs text-zinc-500">
            Mesmo período de {nomeDoMes(mesAnt, anoAnt)}: {formatCurrencyBRL(vendidoMesAnterior)}
            {variacao !== null && (
              <strong
                className={variacao >= 0 ? "ml-1 text-emerald-700" : "ml-1 text-amber-700"}
              >
                {variacao >= 0 ? "+" : ""}
                {variacao}%
              </strong>
            )}
          </p>
        )}
      </div>

      {ranking.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {ranking.map(([nome, v]) => (
            <span key={nome}>
              {nome}: <strong className="tabular-nums text-zinc-700">{formatCurrencyBRL(v)}</strong>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
