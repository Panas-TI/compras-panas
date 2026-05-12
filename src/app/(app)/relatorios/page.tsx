import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GastoSemanaChart, GastoBarChart, PrecoEvolucaoChart } from "./charts";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

const APROVED_STATUSES = ["Aprovada", "Aprovada & Recebida", "Volumes ou Preço Alterados"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseDate(s: string | undefined, fallback: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  return s;
}

export default async function RelatoriosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Default range: últimos 90 dias
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 90);
  const defaultStart = start.toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);

  const from = parseDate(typeof sp.from === "string" ? sp.from : undefined, defaultStart);
  const to = parseDate(typeof sp.to === "string" ? sp.to : undefined, defaultEnd);
  const itemSel = typeof sp.item === "string" ? sp.item : "";

  // --- Solicitations within date range (uses data_inicio) ---
  const { data: solicsInRange } = await supabase
    .from("solicitacoes_semanais")
    .select("id, data_inicio, data_fim")
    .gte("data_inicio", from)
    .lte("data_inicio", to);

  const solicIdsInRange = (solicsInRange ?? []).map((s) => s.id);
  const solicById = new Map<string, { data_inicio: string }>();
  for (const s of solicsInRange ?? []) solicById.set(s.id, { data_inicio: s.data_inicio });

  // --- Linhas aprovadas no período ---
  let linhasAprovadas: Array<{
    solicitacao_id: string;
    item_id: string;
    fornecedor_id: string | null;
    valor: number | null;
    preco: number | null;
    volume_solicitado: number | null;
    data_compra: string | null;
    item: { nome: string; classificacao_id: string | null; classificacao: { nome: string } | null } | null;
    fornecedor: { nome: string } | null;
  }> = [];
  if (solicIdsInRange.length) {
    const { data } = await supabase
      .from("solicitacao_linhas")
      .select(
        `
        solicitacao_id, item_id, fornecedor_id, valor, preco, volume_solicitado, data_compra,
        item:itens(nome, classificacao_id, classificacao:classificacoes(nome)),
        fornecedor:fornecedores(nome)
      `
      )
      .in("solicitacao_id", solicIdsInRange)
      .in("status", APROVED_STATUSES);
    linhasAprovadas = (data ?? []) as typeof linhasAprovadas;
  }

  // ====== Gasto por semana (últimas 12 semanas, ignorando filtro) ======
  const { data: solics12 } = await supabase
    .from("solicitacoes_semanais")
    .select("id, data_inicio")
    .order("data_inicio", { ascending: false })
    .limit(12);
  const ids12 = (solics12 ?? []).map((s) => s.id);
  let semanaTotals: Record<string, number> = {};
  if (ids12.length) {
    const { data: linhas12 } = await supabase
      .from("solicitacao_linhas")
      .select("solicitacao_id, valor")
      .in("solicitacao_id", ids12)
      .in("status", APROVED_STATUSES);
    const startById = new Map<string, string>();
    for (const s of solics12 ?? []) startById.set(s.id, s.data_inicio);
    for (const l of linhas12 ?? []) {
      const semana = startById.get(l.solicitacao_id);
      if (!semana) continue;
      semanaTotals[semana] = (semanaTotals[semana] ?? 0) + Number(l.valor ?? 0);
    }
  }
  const gastoSemana = Object.entries(semanaTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ semana: formatDateBR(d), total: v }));

  // ====== Gasto por classificação ======
  const classifTotals = new Map<string, number>();
  for (const l of linhasAprovadas) {
    const c = l.item?.classificacao?.nome ?? "— sem classificação —";
    classifTotals.set(c, (classifTotals.get(c) ?? 0) + Number(l.valor ?? 0));
  }
  const gastoClassif = Array.from(classifTotals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);

  // ====== Top 10 fornecedores ======
  const fornTotals = new Map<string, number>();
  for (const l of linhasAprovadas) {
    const f = l.fornecedor?.nome ?? "— sem fornecedor —";
    fornTotals.set(f, (fornTotals.get(f) ?? 0) + Number(l.valor ?? 0));
  }
  const topFornecedores = Array.from(fornTotals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ====== Top itens (por valor) ======
  const itemTotals = new Map<string, { nome: string; valor: number; volume: number; vezes: number }>();
  for (const l of linhasAprovadas) {
    if (!l.item_id) continue;
    const cur = itemTotals.get(l.item_id) ?? { nome: l.item?.nome ?? "?", valor: 0, volume: 0, vezes: 0 };
    cur.valor += Number(l.valor ?? 0);
    cur.volume += Number(l.volume_solicitado ?? 0);
    cur.vezes += 1;
    itemTotals.set(l.item_id, cur);
  }
  const topItens = Array.from(itemTotals.values())
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // ====== Itens sem código Queóps ======
  const { data: itensSemCodigo, count: itensSemCount } = await supabase
    .from("itens")
    .select("id, nome", { count: "exact" })
    .eq("ativo", true)
    .is("codigo_queops", null)
    .order("nome")
    .limit(50);

  // ====== Evolução de preço por item ======
  let precoEvolucao: { data: string; preco: number }[] = [];
  let itemSelLabel: string | null = null;
  const { data: allItensList } = await supabase
    .from("itens")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  if (itemSel) {
    const { data: linhasItem } = await supabase
      .from("solicitacao_linhas")
      .select("preco, data_compra, criado_em, solicitacao_id")
      .eq("item_id", itemSel)
      .in("status", APROVED_STATUSES)
      .order("criado_em", { ascending: true });
    const fallbackByStart = new Map<string, string>();
    if (linhasItem?.length) {
      const sids = [...new Set(linhasItem.map((l) => l.solicitacao_id))];
      const { data: solStarts } = await supabase
        .from("solicitacoes_semanais")
        .select("id, data_inicio")
        .in("id", sids);
      for (const s of solStarts ?? []) fallbackByStart.set(s.id, s.data_inicio);
    }
    for (const l of linhasItem ?? []) {
      const d = l.data_compra ?? fallbackByStart.get(l.solicitacao_id) ?? l.criado_em.slice(0, 10);
      if (!d || l.preco == null) continue;
      precoEvolucao.push({ data: formatDateBR(d), preco: Number(l.preco) });
    }
    itemSelLabel = allItensList?.find((i) => i.id === itemSel)?.nome ?? null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-zinc-600">
          Período aplicado às seções abaixo (exceto "Gasto por semana", que sempre mostra últimas 12 semanas).
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">De</label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">Até</label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label htmlFor="item" className="text-sm font-medium">Item (pra evolução de preço)</label>
          <Select id="item" name="item" defaultValue={itemSel}>
            <option value="">— selecionar —</option>
            {(allItensList ?? []).map((i) => (
              <option key={i.id} value={i.id}>{i.nome}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">Aplicar</Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto por semana (últimas 12)</CardTitle>
        </CardHeader>
        <CardContent>
          {gastoSemana.length ? (
            <GastoSemanaChart data={gastoSemana} />
          ) : (
            <p className="text-sm text-zinc-500">Sem dados ainda.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gasto por classificação</CardTitle>
          </CardHeader>
          <CardContent>
            {gastoClassif.length ? (
              <GastoBarChart data={gastoClassif} />
            ) : (
              <p className="text-sm text-zinc-500">Sem dados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 fornecedores</CardTitle>
          </CardHeader>
          <CardContent>
            {topFornecedores.length ? (
              <GastoBarChart data={topFornecedores} />
            ) : (
              <p className="text-sm text-zinc-500">Sem dados.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 itens (por valor)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Vezes comprado</th>
                <th className="px-3 py-2 text-right font-medium">Volume total</th>
                <th className="px-3 py-2 text-right font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {topItens.map((i, idx) => (
                <tr key={idx} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2">{i.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.vezes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.volume.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyBRL(i.valor)}</td>
                </tr>
              ))}
              {!topItens.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Sem dados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução de preço {itemSelLabel ? `— ${itemSelLabel}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {itemSel ? (
            precoEvolucao.length ? (
              <PrecoEvolucaoChart data={precoEvolucao} />
            ) : (
              <p className="text-sm text-zinc-500">Sem compras aprovadas pra este item.</p>
            )
          ) : (
            <p className="text-sm text-zinc-500">Selecione um item no filtro acima.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Itens sem código Queóps ({itensSemCount ?? 0} no total{itensSemCount && itensSemCount > 50 ? " — mostrando primeiros 50" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(itensSemCodigo?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum item sem código.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {(itensSemCodigo ?? []).map((i) => (
                <li key={i.id} className="truncate">
                  <Link href={`/itens/${i.id}`} className="text-sm text-zinc-700 hover:underline">
                    {i.nome}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
