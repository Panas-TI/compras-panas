import { createClient } from "@/lib/supabase/server";
import { guardVendas } from "../guard";
import { Card, CardContent } from "@/components/ui/card";
import { LinkCliente, EstadoPill, Telefone } from "../ui";
import { RegistrarContato } from "../registrar-contato";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { TENTATIVAS_ATE_PARAR, rotuloQuando } from "../contato-regras";

export const dynamic = "force-dynamic";

/**
 * Quem já foi chamado demais sem comprar.
 *
 * Estes clientes saíram da lista do dia de propósito. Ligar uma quinta vez pra
 * quem não comprou nas quatro anteriores não é persistência: é ocupar a vaga
 * de quem ainda compraria — e havia cliente com 13 tentativas e nenhum pedido
 * entupindo a lista diária.
 *
 * Mas sumir seria pior. Aqui eles ficam juntos, com quantas vezes se tentou e
 * quanto cada um vale, porque a decisão que falta não é "ligar de novo": é
 * visitar, dar condição, ou parar. São decisões de outra natureza, e por isso
 * têm tela própria em vez de linha na lista.
 */
export default async function SemFecharPage() {
  const { podeEscrever } = await guardVendas();
  const supabase = await createClient();

  const { data: ultimos } = await supabase
    .from("vendas_ultimo_contato")
    .select("cliente_id, tentativas, criado_em, resultado, observacao, adiar_ate")
    .gte("tentativas", TENTATIVAS_ATE_PARAR);

  const ids = (ultimos ?? []).map((u) => u.cliente_id).filter((x): x is string => !!x);

  const { data: clientes } = ids.length
    ? await supabase
        .from("vendas_clientes")
        .select(
          "id, nome, status, ticket_medio, receita_anual_risco, ultima_compra, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, intervalo_mediano_dias"
        )
        .in("id", ids)
        .eq("ativo", true)
    : { data: [] };

  const porId = new Map((ultimos ?? []).map((u) => [u.cliente_id, u]));
  const linhas = (clientes ?? [])
    .map((c) => ({ c, u: porId.get(c.id)! }))
    // Mais valioso primeiro: é onde vale gastar uma visita.
    .sort((a, b) => Number(b.c.receita_anual_risco ?? 0) - Number(a.c.receita_anual_risco ?? 0));

  const emRisco = linhas.reduce((s, l) => s + Number(l.c.receita_anual_risco ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Não está fechando</h1>
        <p className="text-sm text-zinc-600">
          {linhas.length === 0
            ? "Ninguém aqui. Todo cliente chamado está convertendo ou ainda dentro das tentativas."
            : `${linhas.length} ${
                linhas.length === 1 ? "cliente foi chamado" : "clientes foram chamados"
              } ${TENTATIVAS_ATE_PARAR} vezes ou mais desde a última compra e não pediu nada. Saíram da lista do dia — o que falta aqui não é mais um telefonema.`}
        </p>
        {linhas.length > 0 && (
          <p className="mt-1 text-sm text-zinc-600">
            Juntos valem{" "}
            <strong className="tabular-nums">{formatCurrencyBRL(emRisco)}</strong> por ano.
          </p>
        )}
      </div>

      {linhas.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Nada por aqui — e isso é bom sinal.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {linhas.map(({ c, u }) => (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-900">
                    {u.tentativas} tentativas
                  </span>
                  <EstadoPill status={c.status} />
                  <LinkCliente id={c.id} nome={c.nome} />
                </div>
                <div className="text-sm text-zinc-600">
                  ticket{" "}
                  <strong className="tabular-nums text-zinc-900">
                    {formatCurrencyBRL(Number(c.ticket_medio ?? 0))}
                  </strong>
                  <span className="ml-2 text-zinc-400">
                    {formatCurrencyBRL(Number(c.receita_anual_risco ?? 0))}/ano em risco
                  </span>
                </div>
              </div>

              <p className="text-sm text-zinc-600">
                última compra{" "}
                {c.ultima_compra ? formatDateBR(c.ultima_compra) : "nenhuma registrada"}
                {c.intervalo_mediano_dias && ` · costumava comprar a cada ${c.intervalo_mediano_dias} dias`}
                {" · "}último contato {rotuloQuando(String(u.criado_em))}
                {u.observacao && ` — “${u.observacao}”`}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                <Telefone
                  e164={c.telefone_e164}
                  raw={c.telefone_raw}
                  presumido={c.telefone_presumido}
                  canal={c.canal_preferido}
                />
                {/* O formulário completo, e não o clique rápido: aqui o que
                    falta é registrar uma decisão — visitou, deu condição,
                    desistiu —, não mais uma tentativa. */}
                {podeEscrever && (
                  <RegistrarContato
                    clienteId={c.id}
                    nome={c.nome}
                    intervaloDias={c.intervalo_mediano_dias}
                    rotulo="Registrar decisão"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
