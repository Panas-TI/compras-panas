import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GrupoEditor, type GrupoItem, type CatalogItem } from "./grupo-editor";

export default async function GrupoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: grupo } = await supabase
    .from("templates_contagem")
    .select("id, nome, descricao, ativo")
    .eq("id", id)
    .maybeSingle();
  if (!grupo) notFound();

  const [{ data: itensRaw }, { data: catalogo }] = await Promise.all([
    supabase
      .from("template_itens")
      .select(
        `
        id, ordem, secao, texto, item_id,
        item:itens(nome, codigo_queops)
      `
      )
      .eq("template_id", id)
      .order("ordem"),
    supabase.from("itens").select("id, nome, codigo_queops").eq("ativo", true).order("nome"),
  ]);

  const itens: GrupoItem[] = (itensRaw ?? []).map((i) => ({
    id: i.id,
    ordem: i.ordem,
    secao: i.secao,
    texto: i.texto,
    item_id: i.item_id,
    item_nome: i.item?.nome ?? null,
    item_codigo: i.item?.codigo_queops ?? null,
  }));

  const catItems: CatalogItem[] = (catalogo ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    codigo: c.codigo_queops,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/itens/grupos" className="text-sm text-zinc-600 hover:underline">
          ← Voltar pros grupos
        </Link>
      </div>
      <GrupoEditor
        grupoId={grupo.id}
        nomeInicial={grupo.nome}
        descricaoInicial={grupo.descricao}
        ativoInicial={grupo.ativo}
        itensIniciais={itens}
        catalogo={catItems}
      />
    </div>
  );
}
