import { guardVendas } from "./guard";
import { EstadoPill, Telefone, ItensHabituais, LinkCliente, diasTexto, recenciaDias } from "./ui";
import type { ItemHabitual } from "./ui";
import { RegistrarContato } from "./registrar-contato";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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
    supabase.from("vendas_contatos").select("cliente_id, adiar_ate").gte("adiar_ate", hoje),
    supabase
      .from("vendas_contatos")
      .select("id", { count: "exact", head: true })
      .gte("criado_em", `${hoje}T00:00:00`),
  ]);

  // Quem já disse quando volta sai da fila até a data combinada
  const silenciados = new Set((adiados ?? []).map((a) => a.cliente_id));
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
            Nenhum cliente na fila de hoje. {silenciados.size > 0 && `${silenciados.size} aguardando data combinada.`}
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
                  {podeEscrever && <RegistrarContato clienteId={c.id} nome={c.nome} />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
