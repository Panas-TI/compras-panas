import { createClient } from "@/lib/supabase/server";
import { formatCurrencyBRL } from "@/lib/utils";

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
  const hoje = new Date();
  const inicio = segundaDa(hoje);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);

  const { data } = await supabase
    .from("vendas_pedidos")
    .select("total, data, atendente")
    .gte("data", iso(inicio))
    .lte("data", iso(fim))
    .eq("eh_valido", true);

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
        </div>
        <div className="text-right text-sm">
          {bateu ? (
            <p className="font-medium text-emerald-700">✓ Meta batida</p>
          ) : (
            <>
              <p className="text-zinc-600">
                faltam <strong className="tabular-nums text-zinc-900">{formatCurrencyBRL(falta)}</strong>
              </p>
              <p className="text-xs text-zinc-500">
                {uteis} {uteis === 1 ? "dia útil" : "dias úteis"} · ~
                {formatCurrencyBRL(porDia)}/dia · ~{pedidosPorDia} pedidos/dia
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
