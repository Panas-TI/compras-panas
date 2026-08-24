"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PAPEIS = ["aprovador", "estoquista"];

async function guard(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS.includes(p.role)) return { erro: "Sem permissão." };
  return { userId: user.id };
}

/**
 * Lança o que saiu de fato naquela linha.
 *
 * Aceita null (ainda não fechou) e aceita zero — zero é resposta válida: o
 * turno rodou e nada saiu daquele produto. Tratar zero como "vazio" apagaria
 * justamente a informação que interessa.
 */
export async function lancarRealizadoAction(
  linha_id: string,
  realizado: number | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };
  if (realizado !== null && (!Number.isFinite(realizado) || realizado < 0)) {
    return { error: "Quantidade inválida." };
  }

  const { error } = await supabase
    .from("pcp_linha")
    .update({ realizado })
    .eq("id", linha_id);
  if (error) return { error: error.message };

  revalidatePath("/pcp");
  return {};
}

export type LinhaEntrada = {
  turno_id: string;
  produto_id: string;
  projetado: number;
  colaboradores: string[];
};

/**
 * Grava o plano do dia inteiro.
 *
 * Regrava tudo em vez de diferenciar linha a linha — o plano é pequeno e a
 * alternativa abriria espaço pra estado parcial se algo falhasse no meio.
 * O realizado já lançado é preservado: apagá-lo perderia trabalho da produção.
 */
export async function salvarPlanoAction(
  data: string,
  linhas: LinhaEntrada[],
  observacoes: string | null
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Data inválida." };

  const vistos = new Set<string>();
  for (const l of linhas) {
    const k = `${l.turno_id}|${l.produto_id}`;
    if (vistos.has(k)) return { error: "O mesmo produto aparece duas vezes no mesmo turno." };
    vistos.add(k);
    if (!(l.projetado > 0)) return { error: "Toda linha precisa de quantidade maior que zero." };
  }

  const { data: existente } = await supabase
    .from("pcp_dia")
    .select("id")
    .eq("data", data)
    .maybeSingle();

  let pcpId = existente?.id ?? null;
  if (pcpId) {
    await supabase.from("pcp_dia").update({ observacoes }).eq("id", pcpId);
  } else {
    const { data: novo, error } = await supabase
      .from("pcp_dia")
      .insert({ data, observacoes, criado_por: g.userId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    pcpId = novo!.id;
  }

  // Guarda o realizado antes de regravar — é trabalho já feito pela produção.
  const { data: antigas } = await supabase
    .from("pcp_linha")
    .select("turno_id, produto_id, realizado")
    .eq("pcp_id", pcpId);
  const realizadoAntes = new Map(
    (antigas ?? [])
      .filter((a) => a.realizado !== null)
      .map((a) => [`${a.turno_id}|${a.produto_id}`, Number(a.realizado)])
  );

  await supabase.from("pcp_linha").delete().eq("pcp_id", pcpId);

  for (const l of linhas) {
    const { data: nova, error } = await supabase
      .from("pcp_linha")
      .insert({
        pcp_id: pcpId,
        turno_id: l.turno_id,
        produto_id: l.produto_id,
        projetado: l.projetado,
        realizado: realizadoAntes.get(`${l.turno_id}|${l.produto_id}`) ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: `Erro gravando linha: ${error.message}` };

    if (l.colaboradores.length > 0) {
      const { error: cErr } = await supabase
        .from("pcp_linha_colaborador")
        .insert(l.colaboradores.map((colaborador_id) => ({ linha_id: nova!.id, colaborador_id })));
      if (cErr) return { error: `Erro gravando colaboradores: ${cErr.message}` };
    }
  }

  revalidatePath("/pcp");
  revalidatePath("/pcp/planejar");
  return { ok: true };
}

export async function apagarPlanoAction(data: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };
  const { error } = await supabase.from("pcp_dia").delete().eq("data", data);
  if (error) return { error: error.message };
  revalidatePath("/pcp");
  return {};
}
