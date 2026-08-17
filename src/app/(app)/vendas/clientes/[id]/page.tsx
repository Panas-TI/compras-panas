import Link from "next/link";
import { notFound } from "next/navigation";
import { guardVendas } from "../../guard";
import { EstadoPill, Telefone, ResultadoPill, diasTexto, recenciaDias } from "../../ui";
import type { ItemHabitual } from "../../ui";
import { RegistrarContato } from "../../registrar-contato";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, podeEscrever } = await guardVendas();

  const { data: cliente } = await supabase
    .from("vendas_clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [{ data: apelidos }, { data: pedidos }, { data: contatos }] = await Promise.all([
    supabase.from("vendas_cliente_apelidos").select("cadastro_original, reconhecido").eq("cliente_id", id),
    supabase
      .from("vendas_pedidos")
      .select("pedido, data, total, forma_pag, eh_valido")
      .eq("cliente_id", id)
      .order("data", { ascending: false })
      .limit(12),
    supabase
      .from("vendas_contatos")
      .select("id, canal, resultado, observacao, adiar_ate, criado_em, usuario:profiles(nome)")
      .eq("cliente_id", id)
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);

  const itens = (cliente.itens_habituais as ItemHabitual[] | null) ?? [];
  const rec = recenciaDias(cliente.ultima_compra);
  const outrosNomes = (apelidos ?? [])
    .map((a) => a.cadastro_original)
    .filter((n) => n !== cliente.nome);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/vendas/clientes" className="text-sm text-zinc-600 hover:underline">
        ← Clientes
      </Link>

      {/* Identificação */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cliente.nome}</h1>
          <EstadoPill status={cliente.status} />
          {cliente.verificar && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              ⚠ {cliente.motivo_verificar ?? "conferir cadastro"}
            </span>
          )}
        </div>
        {cliente.endereco && <p className="text-sm text-zinc-600">{cliente.endereco}</p>}
        <div className="text-sm">
          <Telefone
            e164={cliente.telefone_e164}
            raw={cliente.telefone_raw}
            presumido={cliente.telefone_presumido}
            canal={cliente.canal_preferido}
          />
        </div>
        {outrosNomes.length > 0 && (
          <p className="text-xs text-zinc-500">
            Também cadastrado como: {outrosNomes.join(" · ")}
          </p>
        )}
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-zinc-500">Total comprado</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrencyBRL(Number(cliente.total_vendas))}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-zinc-500">Ticket médio</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrencyBRL(Number(cliente.ticket_medio))}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-zinc-500">Pedidos</div>
          <div className="text-xl font-semibold tabular-nums">{cliente.frequencia_compras}</div>
          {cliente.primeira_compra && (
            <div className="text-xs text-zinc-400">desde {formatDateBR(cliente.primeira_compra)}</div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-zinc-500">Ritmo</div>
          <div className="text-xl font-semibold tabular-nums">
            {cliente.intervalo_mediano_dias ? `${cliente.intervalo_mediano_dias} dias` : "—"}
          </div>
          {cliente.data_prevista_compra && (
            <div className="text-xs text-zinc-400">
              previsto {formatDateBR(cliente.data_prevista_compra)}
            </div>
          )}
        </CardContent></Card>
      </div>

      {cliente.ultima_compra && (
        <p className="text-sm text-zinc-600">
          Última compra em <strong>{formatDateBR(cliente.ultima_compra)}</strong> ({diasTexto(rec)})
          {cliente.receita_anual_risco != null && cliente.status === "inativo" && (
            <> · <span className="text-amber-700">
              {formatCurrencyBRL(Number(cliente.receita_anual_risco))}/ano deixando de entrar
            </span></>
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Itens habituais */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">O que sempre leva</h2>
            {itens.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem itens registrados.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.produto} className="border-b border-zinc-50 last:border-0">
                      <td className="py-1.5">{i.produto}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-600">
                        {Number(i.qtd).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Últimos pedidos */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Últimos pedidos</h2>
            <table className="w-full text-sm">
              <tbody>
                {(pedidos ?? []).map((p) => (
                  <tr key={p.pedido} className="border-b border-zinc-50 last:border-0">
                    <td className="py-1.5 text-zinc-600">{formatDateBR(p.data)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatCurrencyBRL(Number(p.total))}
                    </td>
                    <td className="py-1.5 pl-3 text-xs text-zinc-500">
                      {p.forma_pag}
                      {!p.eh_valido && (
                        <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px]">não conta</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de contato */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Histórico de contato</h2>
            {podeEscrever && (
              <RegistrarContato
                clienteId={cliente.id}
                nome={cliente.nome}
                intervaloDias={cliente.intervalo_mediano_dias}
              />
            )}
          </div>
          {(contatos ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum contato registrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {(contatos ?? []).map((c) => {
                const quem = (c.usuario as { nome?: string } | null)?.nome ?? "—";
                return (
                  <li key={c.id} className="border-b border-zinc-50 pb-1.5 last:border-0">
                    <span className="text-zinc-500">
                      {formatDateBR(String(c.criado_em).slice(0, 10))} · {quem} · {c.canal}
                    </span>{" "}
                    · <ResultadoPill resultado={c.resultado} />
                    {c.observacao && <span className="text-zinc-600"> — “{c.observacao}”</span>}
                    {c.adiar_ate && (
                      <span className="ml-1 text-xs text-zinc-400">
                        (volta em {formatDateBR(c.adiar_ate)})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
