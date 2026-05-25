import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ItensPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const classifId = typeof sp.classif === "string" ? sp.classif : "";
  const semCodigo = sp.sem_codigo === "1";
  const incluirInativos = sp.inativos === "1";

  const supabase = await createClient();

  let query = supabase
    .from("itens")
    .select(
      `
      id, nome, codigo_queops, preco_referencia, ativo, prazo_padrao,
      classificacao:classificacoes(nome),
      unidade:unidades_medida(nome),
      fornecedor:fornecedores!itens_fornecedor_padrao_id_fkey(nome),
      forma_pagto:formas_pagamento!itens_forma_pagto_padrao_id_fkey(nome)
    `
    )
    .order("nome");

  if (!incluirInativos) query = query.eq("ativo", true);
  if (q) {
    // Escapa vírgula e parênteses no termo (são separadores do PostgREST .or)
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) {
      query = query.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
    }
  }
  if (classifId) query = query.eq("classificacao_id", classifId);
  if (semCodigo) query = query.is("codigo_queops", null);

  const [{ data: itens, error }, { data: classificacoes }] = await Promise.all([
    query,
    supabase.from("classificacoes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Itens</h1>
          <p className="text-sm text-zinc-600">{itens?.length ?? 0} itens encontrados.</p>
        </div>
        <Link href="/itens/novo">
          <Button>Novo item</Button>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="classif">
            Classificação
          </label>
          <Select id="classif" name="classif" defaultValue={classifId}>
            <option value="">Todas</option>
            {(classificacoes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="sem_codigo" value="1" defaultChecked={semCodigo} />
          Apenas sem código Queóps
        </label>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={incluirInativos} />
          Incluir inativos
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {error && <p className="text-sm text-red-600">Erro: {error.message}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                {(itens ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {i.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                    </td>
                    <td className="px-3 py-2">{i.nome}</td>
                    <td className="px-3 py-2 text-zinc-600">{i.classificacao?.nome ?? "—"}</td>
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
                {!itens?.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhum item encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
