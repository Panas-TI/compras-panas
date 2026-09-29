import { createClient } from "@/lib/supabase/server";
import { LinkCliente } from "./ui";

/**
 * A prestação de contas da carteira: todo cliente ativo, num estado com nome.
 *
 * Em uma semana, três bugs diferentes deram o mesmo sintoma — cliente vivo
 * fora de todas as listas. Nenhum deu erro na tela. Os três foram descobertos
 * porque o vendedor reparou a falta olhando o WhatsApp, e cada dia até
 * perceber é venda que não foi feita.
 *
 * Este bloco cobra a única coisa que tem que valer sempre: se ninguém vai
 * falar com um cliente hoje, o sistema precisa saber dizer por quê. Quem não
 * tem motivo com nome aparece aqui em vermelho, com nome e telefone, no mesmo
 * dia — seja qual for a causa nova.
 *
 * Fica calado quando está tudo certo. Alarme que toca à toa deixa de ser
 * lido.
 */
const ROTULO: Record<string, { texto: string; ajuda: string }> = {
  na_lista: { texto: "na lista de hoje", ajuda: "você vai falar com eles hoje" },
  silenciado: {
    texto: "combinaram outro dia",
    ajuda: "responderam e ficou combinado voltar numa data",
  },
  aguardando_ciclo: {
    texto: "comprando no ritmo",
    ajuda: "a próxima compra deles ainda está longe",
  },
  agenda_propria: {
    texto: "fora do dia marcado",
    ajuda: "você escolheu dias específicos para eles",
  },
  reativacao: {
    texto: "parados, na fila de reativação",
    ajuda: "a cota diária vai alcançando do maior valor em risco pro menor",
  },
  nunca_comprou: { texto: "sem compra registrada", ajuda: "cadastro sem histórico" },
};

export async function CoberturaClientes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendas_cobertura_clientes")
    .select("id, nome, estado, status, parado_ha, ultima_compra");

  if (!data || data.length === 0) return null;

  const porEstado = new Map<string, number>();
  const invisiveis: typeof data = [];
  for (const c of data) {
    const e = c.estado ?? "INVISIVEL";
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
    if (e === "INVISIVEL") invisiveis.push(c);
  }

  const total = data.length;
  const ordem = ["na_lista", "silenciado", "agenda_propria", "aguardando_ciclo", "reativacao", "nunca_comprou"];

  return (
    <div className="flex flex-col gap-2">
      {invisiveis.length > 0 && (
        <div className="rounded-md border-2 border-red-400 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            ⚠ {invisiveis.length}{" "}
            {invisiveis.length === 1 ? "cliente ativo está" : "clientes ativos estão"} fora de
            todas as listas
          </p>
          <p className="mt-1 text-sm text-red-800">
            Ninguém vai falar com {invisiveis.length === 1 ? "ele" : "eles"} hoje e o sistema não
            sabe dizer por quê. Isso é defeito, não é decisão — me avise que eu conserto. Enquanto
            isso, fale com {invisiveis.length === 1 ? "ele" : "eles"} pela mão:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {invisiveis.slice(0, 12).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <LinkCliente id={c.id!} nome={c.nome ?? "—"} />
                <span className="text-red-700">
                  {c.status}
                  {c.parado_ha != null && ` · parado há ${c.parado_ha} dias`}
                </span>
              </li>
            ))}
            {invisiveis.length > 12 && (
              <li className="text-sm text-red-700">e mais {invisiveis.length - 12}</li>
            )}
          </ul>
        </div>
      )}

      <details className="rounded-md border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-4 py-2 text-sm text-zinc-600">
          <strong className="text-zinc-900">{total}</strong> clientes ativos, todos com destino
          {invisiveis.length === 0 && <span className="ml-1 text-emerald-700">✓</span>}
          <span className="ml-1 text-xs text-zinc-400">(clique pra ver a conta)</span>
        </summary>
        <ul className="flex flex-col gap-1.5 border-t border-zinc-100 px-4 py-3 text-sm">
          {ordem
            .filter((e) => porEstado.get(e))
            .map((e) => (
              <li key={e} className="flex flex-wrap items-baseline gap-2">
                <span className="w-10 text-right font-semibold tabular-nums">
                  {porEstado.get(e)}
                </span>
                <span className="text-zinc-900">{ROTULO[e]?.texto ?? e}</span>
                <span className="text-xs text-zinc-500">— {ROTULO[e]?.ajuda ?? ""}</span>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
