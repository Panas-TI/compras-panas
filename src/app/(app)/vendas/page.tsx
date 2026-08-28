import { guardVendas } from "./guard";
import {
  EstadoPill,
  Telefone,
  ItensHabituais,
  LinkCliente,
  ResultadoPill,
  MotivoTag,
  diasTexto,
  recenciaDias,
} from "./ui";
import { RegistrarContato } from "./registrar-contato";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AlertaImportacao } from "./alerta-importacao";
import { PlacarMeta } from "./placar-meta";
import { montarPlanoDoDia, TAMANHO_LISTA, type ClienteDoPlano } from "./plano-do-dia";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FAIXA: Record<ClienteDoPlano["faixa"], { rotulo: string; classe: string }> = {
  escolhido: { rotulo: "puxado à mão", classe: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300" },
  retorno: { rotulo: "retorno combinado", classe: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  vencido: { rotulo: "vencido", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  previsto: { rotulo: "vence agora", classe: "bg-blue-50 text-blue-800 border-blue-200" },
  novo: { rotulo: "cliente novo", classe: "bg-violet-50 text-violet-800 border-violet-200" },
  reativacao: { rotulo: "reativação", classe: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export default async function VendasHojePage() {
  const { podeEscrever } = await guardVendas();
  const hoje = new Date().toISOString().slice(0, 10);
  const { lista, trabalhados, totalReativacao } = await montarPlanoDoDia();

  // Quem saiu da lista por ter combinado data — some sem explicação seria pior.
  const supabase = await createClient();
  const { data: adiados } = await supabase
    .from("vendas_contatos")
    .select("cliente_id, adiar_ate, resultado, motivo, observacao, cliente:vendas_clientes(id, nome)")
    .gte("adiar_ate", hoje)
    .order("criado_em", { ascending: false });

  const vistos = new Set<string>();
  const aguardando = (adiados ?? []).filter((a) => {
    if (!a.cliente_id || vistos.has(a.cliente_id)) return false;
    vistos.add(a.cliente_id);
    return true;
  });

  const pct = lista.length > 0 ? Math.round((trabalhados / lista.length) * 100) : 0;
  const pendentes = lista.length - trabalhados;

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <PlacarMeta />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plano do dia · {formatDateBR(hoje)}</h1>
          <p className="text-sm text-zinc-600">
            Lista fechada de {lista.length} clientes. Vencidos primeiro, depois quem vence agora, e
            a cota de reativação completa.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {trabalhados}
            <span className="text-base font-normal text-zinc-400"> de {lista.length}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {pendentes > 0 ? `faltam ${pendentes}` : "lista concluída"}
          </p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? "bg-emerald-500" : "bg-zinc-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {lista.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Nenhum cliente para hoje.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {lista.map((c) => {
          const rec = recenciaDias(c.ultima_compra);
          const f = FAIXA[c.faixa];
          return (
            <Card key={c.id} className={c.trabalhado ? "opacity-60" : undefined}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${f.classe}`}
                    >
                      {f.rotulo}
                    </span>
                    <EstadoPill status={c.status} />
                    <LinkCliente id={c.id} nome={c.nome} />
                    {c.trabalhado && (
                      <span className="text-xs font-medium text-emerald-700">✓ falado hoje</span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600">
                    ticket{" "}
                    <strong className="tabular-nums text-zinc-900">
                      {formatCurrencyBRL(Number(c.ticket_medio ?? 0))}
                    </strong>
                  </div>
                </div>

                <p className="text-sm text-zinc-600">
                  {c.faixa === "escolhido"
                    ? (c.motivoManual ?? "alguém puxou este cliente para hoje")
                    : c.faixa === "retorno" && c.combinado
                    ? `combinado para ${formatDateBR(c.combinado.adiarAte)}${
                        c.combinado.observacao ? ` — “${c.combinado.observacao}”` : ""
                      }`
                    : (c.motivo_contato ?? (c.faixa === "reativacao" ? "parado além do ritmo dele" : ""))}
                  {c.intervalo_mediano_dias ? ` · compra a cada ${c.intervalo_mediano_dias} dias` : ""}
                  {c.ultima_compra
                    ? ` · última ${formatDateBR(c.ultima_compra)} (${diasTexto(rec)})`
                    : ""}
                </p>

                {/* A munição: o que ele comprava e parou. É o argumento que
                    transforma "faz tempo que não compra" em algo respondível. */}
                {c.oportunidade && (
                  <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    💡 Não pede <strong>{c.oportunidade.produto}</strong> há{" "}
                    {c.oportunidade.dias} dias — já comprou {c.oportunidade.vezes} vezes
                  </p>
                )}

                {c.itens_habituais && (
                  <p className="text-sm">
                    <span className="text-zinc-400">Costuma levar: </span>
                    <ItensHabituais itens={c.itens_habituais} />
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                  <Telefone
                    e164={c.telefone_e164}
                    raw={c.telefone_raw}
                    presumido={c.telefone_presumido}
                    canal={c.canal_preferido}
                  />
                  {podeEscrever && (
                    <RegistrarContato
                      clienteId={c.id}
                      nome={c.nome}
                      intervaloDias={c.intervalo_mediano_dias}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        A lista tem alvo de {TAMANHO_LISTA} clientes por dia. {totalReativacao} inativos aguardam
        reativação — na cota atual, o backlog é percorrido por inteiro em algumas semanas.
      </p>

      {aguardando.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-600">
            <strong className="text-zinc-900">{aguardando.length}</strong>{" "}
            {aguardando.length === 1 ? "cliente fora da lista" : "clientes fora da lista"} por
            combinação anterior
            <span className="ml-1 text-xs text-zinc-400">(clique pra ver)</span>
          </summary>
          <ul className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3">
            {aguardando.map((a) => (
              <li key={a.cliente_id} className="flex flex-wrap items-center gap-2 text-sm">
                <ResultadoPill resultado={a.resultado} />
                {a.cliente && <LinkCliente id={a.cliente.id} nome={a.cliente.nome} />}
                <span className="text-zinc-500">volta em {formatDateBR(String(a.adiar_ate))}</span>
                <MotivoTag motivo={a.motivo} />
                {a.observacao && <span className="text-zinc-500">— “{a.observacao}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
