import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Item comprado (tabela `itens`)
type ItemComprado = {
  id: string;
  nome: string;
  codigo_queops: string | null;
  preco_referencia: number | null;
  ativo: boolean;
  classificacao: { nome: string } | null;
  unidade: { nome: string } | null;
  fornecedor: { nome: string } | null;
};

// Produto fabricado (tabela `produto`)
type ProdutoFabricado = {
  id: string;
  nome: string;
  codigo_queops: string | null;
  categoria: string | null;
  unidade_producao: string | null;
  ativo: boolean;
};

export default async function ItensPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const incluirInativos = sp.inativos === "1";
  const semCodigo = sp.sem_codigo === "1";

  const supabase = await createClient();

  const safe = q.replace(/[(),]/g, " ").trim();
  const orFilter = safe ? `nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%` : null;

  // Produtos fabricados (tabela `produto`) — finais e intermediários
  let qFinais = supabase
    .from("produto")
    .select("id, codigo_queops, nome, categoria, unidade_producao, ativo")
    .eq("tipo", "final");
  let qInter = supabase
    .from("produto")
    .select("id, codigo_queops, nome, categoria, unidade_producao, ativo")
    .eq("tipo", "intermediario");
  // Itens comprados (tabela `itens`)
  let qItens = supabase
    .from("itens")
    .select(
      `id, nome, codigo_queops, preco_referencia, ativo,
       classificacao:classificacoes(nome),
       unidade:unidades_medida(nome),
       fornecedor:fornecedores!itens_fornecedor_padrao_id_fkey(nome)`
    );

  if (!incluirInativos) {
    qFinais = qFinais.eq("ativo", true);
    qInter = qInter.eq("ativo", true);
    qItens = qItens.eq("ativo", true);
  }
  if (orFilter) {
    qFinais = qFinais.or(orFilter);
    qInter = qInter.or(orFilter);
    qItens = qItens.or(orFilter);
  }
  if (semCodigo) {
    qFinais = qFinais.is("codigo_queops", null);
    qInter = qInter.is("codigo_queops", null);
    qItens = qItens.is("codigo_queops", null);
  }

  const [{ data: finais }, { data: intermediarios }, { data: itens }, { data: fichaIdsRaw }] =
    await Promise.all([
      qFinais.order("nome"),
      qInter.order("nome"),
      qItens.order("nome"),
      supabase.from("ficha_item").select("item_id").not("item_id", "is", null),
    ]);

  // Itens usados em ficha técnica = matérias-primas; resto = outros
  const usados = new Set(
    (fichaIdsRaw ?? []).map((r) => r.item_id).filter(Boolean) as string[]
  );
  const itensList = (itens ?? []) as unknown as ItemComprado[];
  const materiasPrimas = itensList.filter((i) => usados.has(i.id));
  const outros = itensList.filter((i) => !usados.has(i.id));

  const finaisList = (finais ?? []) as ProdutoFabricado[];
  const interList = (intermediarios ?? []) as ProdutoFabricado[];

  const total = finaisList.length + interList.length + itensList.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo de itens</h1>
          <p className="text-sm text-zinc-600">
            Tudo num lugar só, organizado por categoria. Produtos fabricados abrem a ficha técnica;
            itens comprados abrem o cadastro.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/itens/grupos"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Grupos de contagem
          </Link>
          <Link href="/itens/novo">
            <Button>Novo item</Button>
          </Link>
        </div>
      </div>

      {/* Busca */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="sem_codigo" value="1" defaultChecked={semCodigo} />
          Sem código Queóps
        </label>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={incluirInativos} />
          Incluir inativos
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <p className="text-sm text-zinc-600">{total} itens no total.</p>

      {/* === Seções colapsáveis por categoria === */}
      <SecaoFabricados
        emoji="🥟"
        titulo="Produtos acabados"
        descricao="fabricados — abrem a ficha técnica"
        lista={finaisList}
      />
      <SecaoFabricados
        emoji="🧂"
        titulo="Semi-acabados"
        descricao="fabricados — abrem a ficha técnica"
        lista={interList}
      />
      <SecaoComprados
        emoji="🌾"
        titulo="Matérias-primas"
        descricao="compradas, usadas em ficha técnica"
        lista={materiasPrimas}
      />
      <SecaoComprados
        emoji="📦"
        titulo="Outros itens"
        descricao="comprados, sem ficha técnica"
        lista={outros}
      />
    </div>
  );
}

// ---- Seção de produtos fabricados (tabela produto) ----
function SecaoFabricados({
  emoji,
  titulo,
  descricao,
  lista,
}: {
  emoji: string;
  titulo: string;
  descricao: string;
  lista: ProdutoFabricado[];
}) {
  return (
    <details open className="overflow-hidden rounded-lg border border-purple-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 bg-purple-50/50 px-4 py-3 hover:bg-purple-50">
        <span className="flex items-center gap-2 font-semibold text-zinc-800">
          <span className="text-lg">{emoji}</span>
          {titulo}
          <span className="rounded-full bg-purple-200 px-2 py-0.5 text-xs font-bold text-purple-900">
            {lista.length}
          </span>
        </span>
        <span className="text-xs font-normal text-zinc-500">{descricao}</span>
      </summary>
      {lista.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-400">Nenhum item nesta categoria.</div>
      ) : (
        <div className="overflow-x-auto border-t border-zinc-100">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {p.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                  </td>
                  <td className="px-3 py-2">{p.nome}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{p.categoria ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{p.unidade_producao ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.ativo ? (
                      <span className="text-xs text-emerald-700">ativo</span>
                    ) : (
                      <span className="text-xs text-zinc-500">inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/mrp/produtos/${p.id}`}
                      className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                    >
                      Ver ficha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

// ---- Seção de itens comprados (tabela itens) ----
function SecaoComprados({
  emoji,
  titulo,
  descricao,
  lista,
}: {
  emoji: string;
  titulo: string;
  descricao: string;
  lista: ItemComprado[];
}) {
  return (
    <details open className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 bg-zinc-50 px-4 py-3 hover:bg-zinc-100">
        <span className="flex items-center gap-2 font-semibold text-zinc-800">
          <span className="text-lg">{emoji}</span>
          {titulo}
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-700">
            {lista.length}
          </span>
        </span>
        <span className="text-xs font-normal text-zinc-500">{descricao}</span>
      </summary>
      {lista.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-400">Nenhum item nesta categoria.</div>
      ) : (
        <div className="overflow-x-auto border-t border-zinc-100">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Classificação</th>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 font-medium">Fornecedor padrão</th>
                <th className="px-3 py-2 text-right font-medium">Preço ref.</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {i.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                  </td>
                  <td className="px-3 py-2">{i.nome}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{i.classificacao?.nome ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{i.unidade?.nome ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{i.fornecedor?.nome ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyBRL(i.preco_referencia ?? null)}
                  </td>
                  <td className="px-3 py-2">
                    {i.ativo ? (
                      <span className="text-xs text-emerald-700">ativo</span>
                    ) : (
                      <span className="text-xs text-zinc-500">inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/itens/${i.id}`}
                      className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
