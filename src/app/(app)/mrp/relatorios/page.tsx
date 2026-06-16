import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function isoMesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function mesLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${m}/${y.slice(2)}`;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function RelatoriosMrpPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // === KPIs gerais ===
  const seisMesesAtras = isoMesAtras(6);

  const [
    { count: totalProjecoes },
    { count: convertidas },
    { count: calculadas },
    { count: rascunho },
  ] = await Promise.all([
    supabase.from("projecao_producao").select("*", { count: "exact", head: true }),
    supabase
      .from("projecao_producao")
      .select("*", { count: "exact", head: true })
      .eq("status", "convertida_em_solicitacao"),
    supabase
      .from("projecao_producao")
      .select("*", { count: "exact", head: true })
      .eq("status", "calculada"),
    supabase
      .from("projecao_producao")
      .select("*", { count: "exact", head: true })
      .eq("status", "rascunho"),
  ]);

  // Valor médio das solicitações geradas pelo MRP
  const { data: solicMrp } = await supabase
    .from("solicitacoes_semanais")
    .select(
      `id, data_inicio, linhas:solicitacao_linhas(volume_solicitado, preco)`
    )
    .eq("origem", "MRP")
    .gte("data_inicio", seisMesesAtras);

  type LinhaSol = { volume_solicitado: number; preco: number };
  const valoresSol = (solicMrp ?? []).map((s) => {
    const linhas = (s.linhas ?? []) as LinhaSol[];
    return linhas.reduce((acc, l) => acc + Number(l.volume_solicitado) * Number(l.preco), 0);
  });
  const valorMedio =
    valoresSol.length > 0 ? valoresSol.reduce((a, b) => a + b, 0) / valoresSol.length : null;
  const valorTotal = valoresSol.reduce((a, b) => a + b, 0);

  // === Consumo histórico (últimos 6 meses) — volume_solicitado das origens MRP ===
  type SolicMrpResumo = { id: string; data_inicio: string; linhas: LinhaSol[] };
  const consumoPorMes = new Map<string, number>(); // YYYY-MM → R$
  for (let i = 5; i >= 0; i--) {
    const mes = isoMesAtras(i).slice(0, 7);
    consumoPorMes.set(mes, 0);
  }
  for (const s of (solicMrp ?? []) as SolicMrpResumo[]) {
    const mes = s.data_inicio.slice(0, 7);
    if (!consumoPorMes.has(mes)) continue;
    const total = s.linhas.reduce(
      (acc, l) => acc + Number(l.volume_solicitado) * Number(l.preco),
      0
    );
    consumoPorMes.set(mes, (consumoPorMes.get(mes) ?? 0) + total);
  }
  const mesesArr = Array.from(consumoPorMes.entries());
  const maxMes = Math.max(1, ...mesesArr.map(([, v]) => v));

  // === Top 10 itens por valor (acumulado nas solicitações MRP do período) ===
  type LinhaComItem = {
    volume_solicitado: number;
    preco: number;
    item_id: string;
    item: { nome: string; codigo_queops: string | null } | null;
  };
  let topItens: Array<{ item_id: string; nome: string; codigo: string | null; valor: number; qtd: number }> = [];
  if ((solicMrp?.length ?? 0) > 0) {
    const solicIds = (solicMrp ?? []).map((s) => s.id);
    const { data: linhasAll } = await supabase
      .from("solicitacao_linhas")
      .select(
        `volume_solicitado, preco, item_id, item:itens(nome, codigo_queops)`
      )
      .in("solicitacao_id", solicIds);

    const acc = new Map<string, { nome: string; codigo: string | null; valor: number; qtd: number }>();
    for (const l of (linhasAll ?? []) as LinhaComItem[]) {
      const valor = Number(l.volume_solicitado) * Number(l.preco);
      const cur = acc.get(l.item_id) ?? {
        nome: l.item?.nome ?? "—",
        codigo: l.item?.codigo_queops ?? null,
        valor: 0,
        qtd: 0,
      };
      cur.valor += valor;
      cur.qtd += Number(l.volume_solicitado);
      acc.set(l.item_id, cur);
    }
    topItens = Array.from(acc.entries())
      .map(([item_id, info]) => ({ item_id, ...info }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }

  // === Estoque crítico — itens usados em fichas com estoque < limite ===
  const { data: ultimaContagem } = await supabase
    .from("contagens")
    .select("id, data_contagem")
    .eq("finalizada", true)
    .order("data_contagem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: fichaItens } = await supabase
    .from("ficha_item")
    .select(`item_id, ficha:ficha_tecnica!inner(vigente)`)
    .not("item_id", "is", null)
    .eq("ficha.vigente", true);

  const itensIdsUsados = Array.from(
    new Set((fichaItens ?? []).map((r) => r.item_id).filter(Boolean) as string[])
  );

  type ItemEstoque = {
    id: string;
    codigo_queops: string | null;
    nome: string;
    unidade: { nome: string } | null;
    preco_referencia: number | null;
  };
  let estoqueCritico: Array<{ item: ItemEstoque; qtd: number }> = [];
  if (ultimaContagem && itensIdsUsados.length > 0) {
    const { data: linhasContagem } = await supabase
      .from("contagem_linhas")
      .select("item_id, quantidade")
      .eq("contagem_id", ultimaContagem.id)
      .in("item_id", itensIdsUsados);

    const estoque = new Map<string, number>();
    for (const l of linhasContagem ?? []) {
      if (l.item_id && l.quantidade != null) {
        estoque.set(l.item_id, (estoque.get(l.item_id) ?? 0) + Number(l.quantidade));
      }
    }

    const { data: itensInfo } = await supabase
      .from("itens")
      .select(
        `id, codigo_queops, nome, preco_referencia, unidade:unidades_medida(nome)`
      )
      .in("id", itensIdsUsados);

    estoqueCritico = (itensInfo ?? [])
      .map((it) => ({
        item: it as ItemEstoque,
        qtd: estoque.get(it.id) ?? 0,
      }))
      .filter((x) => x.qtd <= 2) // limite arbitrário: estoque <= 2 unidades
      .sort((a, b) => a.qtd - b.qtd)
      .slice(0, 20);
  }

  const taxaConversao =
    totalProjecoes && totalProjecoes > 0
      ? (((convertidas ?? 0) / totalProjecoes) * 100).toFixed(0)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios MRP</h1>
        <p className="text-sm text-zinc-600">Janela: últimos 6 meses.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Projeções (total)" value={String(totalProjecoes ?? 0)} />
        <Kpi label="Convertidas" value={String(convertidas ?? 0)} />
        <Kpi
          label="Taxa de conversão"
          value={taxaConversao === null ? "—" : `${taxaConversao}%`}
        />
        <Kpi
          label="Valor médio / solicitação"
          value={valorMedio === null ? "—" : `R$ ${formatBRL(valorMedio)}`}
        />
        <Kpi label="Valor total (6m)" value={`R$ ${formatBRL(valorTotal)}`} />
      </div>

      {((rascunho ?? 0) > 0 || (calculadas ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Em andamento</CardTitle>
            <CardDescription>
              {rascunho ?? 0} rascunho(s), {calculadas ?? 0} calculada(s) sem conversão.{" "}
              <Link href="/mrp/projecoes" className="text-zinc-900 underline-offset-4 hover:underline">
                Ver histórico →
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Consumo histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consumo (valor MRP) por mês</CardTitle>
          <CardDescription>
            Soma das solicitações com origem MRP. Hover na barra pra ver o valor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valorTotal === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Sem solicitações MRP nos últimos 6 meses. Crie sua primeira projeção em{" "}
              <Link
                href="/mrp/nova-projecao"
                className="text-zinc-900 underline-offset-4 hover:underline"
              >
                /mrp/nova-projecao
              </Link>
              .
            </p>
          ) : (
            <div className="flex h-44 items-end gap-2">
              {mesesArr.map(([mes, valor]) => {
                const h = (valor / maxMes) * 100;
                return (
                  <div
                    key={mes}
                    className="group flex flex-1 flex-col items-stretch justify-end"
                    title={`${mesLabel(mes + "-01")}: R$ ${formatBRL(valor)}`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-500 transition-opacity group-hover:bg-blue-700"
                      style={{ height: `${h * 1.4}px` }}
                    />
                    <div className="mt-1 text-center text-[10px] text-zinc-500">
                      {mesLabel(mes + "-01")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top itens por valor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 itens por valor (6m)</CardTitle>
          <CardDescription>
            Onde mais saiu dinheiro nas compras MRP. Útil pra revisitar fichas e fornecedores
            dos mais caros.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {topItens.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Sem dados ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd total</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {topItens.map((it, i) => (
                  <tr key={it.item_id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-xs text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{it.codigo ?? "—"}</td>
                    <td className="px-3 py-2">{it.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.qtd.toFixed(3).replace(/\.?0+$/, "")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      R$ {formatBRL(it.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Estoque crítico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estoque crítico</CardTitle>
          <CardDescription>
            Itens usados em fichas técnicas com estoque <strong>≤ 2 unidades</strong> na última
            contagem ({ultimaContagem ? ultimaContagem.data_contagem.split("-").reverse().join("/") : "—"}).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {estoqueCritico.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              🎉 Nenhum item em estoque crítico.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Estoque</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {estoqueCritico.map(({ item, qtd }) => (
                  <tr key={item.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-mono text-xs">{item.codigo_queops ?? "—"}</td>
                    <td className="px-3 py-2">{item.nome}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${qtd === 0 ? "text-red-700" : "text-amber-700"}`}
                    >
                      {qtd.toFixed(3).replace(/\.?0+$/, "")}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{item.unidade?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/itens/${item.id}`}
                        className="text-xs text-zinc-700 underline-offset-4 hover:underline"
                      >
                        Ver item
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        💡 Acurácia da previsão (planejado × produzido) precisa de dados que ainda não
        capturamos (quanto foi realmente produzido por semana). Pra agora, monitora a{" "}
        <strong>taxa de conversão</strong> de projeções (quantas viram solicitação de fato).
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
