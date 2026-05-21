import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateBR } from "@/lib/utils";
import { ContagemTable, type LinhaC, type TemplateOpt } from "./contagem-table";
import { ContagemHeader } from "./header";

export default async function ContagemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contagem } = await supabase
    .from("contagens")
    .select(
      `id, nome, data_contagem, finalizada, finalizada_em, criado_por,
       criador:profiles!contagens_criado_por_fkey(nome)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!contagem) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: meProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = meProfile?.role as "comprador" | "aprovador" | "estoquista" | undefined;
  const canRequestPurchase = role === "comprador" || role === "aprovador";

  const [{ data: linhasRaw }, { data: templates }] = await Promise.all([
    supabase
      .from("contagem_linhas")
      .select("id, ordem, secao, texto, quantidade, observacao, solicitacao_qtd, enviado_em, enviado_solicitacao_id")
      .eq("contagem_id", id)
      .order("ordem"),
    supabase.from("templates_contagem").select("id, nome, descricao").eq("ativo", true).order("nome"),
  ]);

  const linhas: LinhaC[] = (linhasRaw ?? []).map((l) => ({
    id: l.id,
    ordem: l.ordem,
    secao: l.secao,
    texto: l.texto,
    quantidade: l.quantidade,
    observacao: l.observacao,
    solicitacao_qtd: l.solicitacao_qtd,
    enviado_em: l.enviado_em,
    enviado_solicitacao_id: l.enviado_solicitacao_id,
  }));

  const opts: TemplateOpt[] = (templates ?? []).map((t) => ({ id: t.id, nome: t.nome, descricao: t.descricao }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <ContagemHeader
            contagemId={contagem.id}
            nome={contagem.nome}
            data={contagem.data_contagem}
            criadorNome={contagem.criador?.nome ?? null}
            finalizada={contagem.finalizada}
          />
        </div>
        <Link href="/contagem" className="text-sm text-zinc-600 hover:underline print:hidden">
          ← Voltar
        </Link>
      </div>

      <ContagemTable
        contagemId={contagem.id}
        finalizada={contagem.finalizada}
        initialLinhas={linhas}
        templates={opts}
        canRequestPurchase={canRequestPurchase}
      />
    </div>
  );
}
