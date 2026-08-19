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
import type { ItemHabitual } from "./ui";
import { RegistrarContato } from "./registrar-contato";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AlertaImportacao } from "./alerta-importacao";

export const dynamic = "force-dynamic";

export default async function VendasHojePage() {
  const { supabase, podeEscrever } = await guardVendas();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: fila }, { data: adiados }, { count: faladosHoje }] = await Promise.all([
    supabase
      .from("vendas_clientes")
      .select(
        "id, nome, status, motivo_contato, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, data_prevista_compra, ticket_medio, total_vendas, itens_habituais"
      )
      .eq("contatar_3dias", true)
      .eq("ativo", true),
    supabase
      .from("vendas_contatos")
      .select("cliente_id, adiar_ate, resultado, motivo, observacao, criado_em")
      .gte("adiar_ate", hoje)
      .order("criado_em", { ascending: false }),
    supabase
      .from("vendas_contatos")
      .select("id", { count: "exact", head: true })
      .gte("criado_em", `${hoje}T00:00:00`),
  ]);

  // Quem já disse quando volta sai da fila até a data combinada. Guardamos o
  // contato mais recente de cada um pra poder explicar a ausência — some sem
  // dizer por quê é o que fazia o vendedor achar que tinha perdido cliente.
  const adiadoPor = new Map<string, NonNullable<typeof adiados>[number]>();
  for (const a of adiados ?? []) {
    if (a.cliente_id && !adiadoPor.has(a.cliente_id)) adiadoPor.set(a.cliente_id, a);
  }
  const silenciados = new Set(adiadoPor.keys());
  const aguardando = (fila ?? [])
    .filter((c) => silenciados.has(c.id))
    .map((c) => ({ cliente: c, contato: adiadoPor.get(c.id)! }))
    .sort((a, b) => String(a.contato.adiar_ate).localeCompare(String(b.contato.adiar_ate)));
  const lista = (fila ?? [])
    .filter((c) => !silenciados.has(c.id))
    .sort((a, b) => {
      const venc = (m: string | null) => (m?.startsWith("vencido") ? 0 : 1);
      return venc(a.motivo_contato) - venc(b.motivo_contato) ||
        Number(b.ticket_medio ?? 0) - Number(a.ticket_medio ?? 0);
    });

  const vencidos = lista.filter((c) => c.motivo_contato?.startsWith("vencido")).length;

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hoje · {formatDateBR(hoje)}</h1>
          <p className="text-sm text-zinc-600">
            Clientes cujo ciclo de recompra vence agora. Vencidos primeiro, depois por ticket.
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <span>
            <strong className="text-lg tabular-nums">{lista.length}</strong>{" "}
            <span className="text-zinc-500">a contatar</span>
          </span>
          {vencidos > 0 && (
            <span>
              <strong className="text-lg tabular-nums text-amber-700">{vencidos}</strong>{" "}
              <span className="text-zinc-500">vencidos</span>
            </span>
          )}
          <span>
            <strong className="text-lg tabular-nums">{faladosHoje ?? 0}</strong>{" "}
            <span className="text-zinc-500">falados hoje</span>
          </span>
        </div>
      </div>

      {lista.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Nenhum cliente na fila de hoje.{" "}
            {aguardando.length > 0 && `${aguardando.length} aguardando data combinada.`}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {lista.map((c) => {
          const rec = recenciaDias(c.ultima_compra);
          const itens = (c.itens_habituais as ItemHabitual[] | null) ?? null;
          return (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoPill status={c.status} />
                    <LinkCliente id={c.id} nome={c.nome} />
                  </div>
                  <div className="text-sm text-zinc-600">
                    ticket <strong className="tabular-nums text-zinc-900">
                      {formatCurrencyBRL(Number(c.ticket_medio ?? 0))}
                    </strong>
                  </div>
                </div>

                <p className="text-sm text-zinc-600">
                  {c.motivo_contato}
                  {c.intervalo_mediano_dias ? ` · compra a cada ${c.intervalo_mediano_dias} dias` : ""}
                  {c.ultima_compra ? ` · última ${formatDateBR(c.ultima_compra)} (${diasTexto(rec)})` : ""}
                </p>

                {itens && (
                  <p className="text-sm">
                    <span className="text-zinc-400">Costuma levar: </span>
                    <ItensHabituais itens={itens} />
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

      {/* Quem venceu o ciclo mas está fora da fila por combinação anterior.
          Sem isso o cliente simplesmente sumia, sem explicação. */}
      {aguardando.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-600">
            <strong className="text-zinc-900">{aguardando.length}</strong>{" "}
            {aguardando.length === 1 ? "cliente fora da fila" : "clientes fora da fila"} por
            combinação anterior
            <span className="ml-1 text-xs text-zinc-400">(clique pra ver)</span>
          </summary>
          <ul className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3">
            {aguardando.map(({ cliente, contato }) => (
              <li key={cliente.id} className="flex flex-wrap items-center gap-2 text-sm">
                <ResultadoPill resultado={contato.resultado} />
                <LinkCliente id={cliente.id} nome={cliente.nome} />
                <span className="text-zinc-500">
                  volta em {formatDateBR(String(contato.adiar_ate))}
                </span>
                <MotivoTag motivo={contato.motivo} />
                {contato.observacao && (
                  <span className="text-zinc-500">— “{contato.observacao}”</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
