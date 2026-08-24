"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PAPEIS = ["aprovador", "estoquista", "gestor_producao"];

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

/**
 * O PCP tem duas folhas no mesmo dia: o que sai pra venda ("final") e o que
 * alimenta a produção — recheios, massas ("intermediario"). Cada aba grava só
 * as suas linhas; sem isso, salvar uma apagaria a outra.
 */
export type TipoFolha = "final" | "intermediario";

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
  observacoes: string | null,
  tipo: TipoFolha = "final"
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

  // Produto de outra folha não entra: a aba que o receberia acabaria apagando
  // a linha na próxima gravação, sem ninguém entender por quê.
  if (linhas.length > 0) {
    const ids = Array.from(new Set(linhas.map((l) => l.produto_id)));
    const { data: prods, error: pErr } = await supabase
      .from("produto")
      .select("id, tipo")
      .in("id", ids);
    if (pErr) return { error: pErr.message };
    if ((prods ?? []).length !== ids.length) return { error: "Produto não encontrado." };
    if ((prods ?? []).some((p) => p.tipo !== tipo)) {
      return { error: "Há produto que não pertence a esta folha." };
    }
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
    .select("id, turno_id, produto_id, realizado, produto:produto(tipo)")
    .eq("pcp_id", pcpId);
  const desteTipo = (antigas ?? []).filter((a) => a.produto?.tipo === tipo);
  const realizadoAntes = new Map(
    desteTipo
      .filter((a) => a.realizado !== null)
      .map((a) => [`${a.turno_id}|${a.produto_id}`, Number(a.realizado)])
  );

  // Só as linhas desta folha. A outra aba fica intacta.
  if (desteTipo.length > 0) {
    const { error: dErr } = await supabase
      .from("pcp_linha")
      .delete()
      .in(
        "id",
        desteTipo.map((a) => a.id)
      );
    if (dErr) return { error: dErr.message };
  }

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

export async function apagarPlanoAction(
  data: string,
  tipo: TipoFolha = "final"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  const { data: dia } = await supabase.from("pcp_dia").select("id").eq("data", data).maybeSingle();
  if (!dia) return {};

  const { data: linhas } = await supabase
    .from("pcp_linha")
    .select("id, produto:produto(tipo)")
    .eq("pcp_id", dia.id);
  const alvo = (linhas ?? []).filter((l) => l.produto?.tipo === tipo);

  if (alvo.length > 0) {
    const { error } = await supabase
      .from("pcp_linha")
      .delete()
      .in(
        "id",
        alvo.map((l) => l.id)
      );
    if (error) return { error: error.message };
  }

  // Dia sem nenhuma folha não deve continuar aparecendo na lista.
  if ((linhas ?? []).length === alvo.length) {
    await supabase.from("pcp_dia").delete().eq("id", dia.id);
  }

  revalidatePath("/pcp");
  return {};
}
