"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || !["aprovador", "comprador"].includes(profile.role)) {
    return { ok: false as const, error: "Sem permissão." };
  }
  return { ok: true as const };
}

/**
 * Consolida 2 itens em 1:
 * - novoId: o item que CRIEI por engano (com código Queóps da planilha)
 * - antigoId: o item que JÁ existia (sem código ou com código diferente)
 *
 * Ação: pega o código Queóps do novo, copia pro antigo (mantendo o nome
 * original do antigo). Repointa todas as ficha_items do novo pro antigo.
 * Apaga o novo. Marca o antigo como revisado.
 */
export async function consolidarAction(
  novoId: string,
  antigoId: string,
  manterNomeNovo: boolean
): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };
  if (novoId === antigoId) return { error: "Não dá pra consolidar item com ele mesmo." };

  const supabase = await createClient();

  // Pega os dois itens
  const { data: novo } = await supabase
    .from("itens")
    .select("id, codigo_queops, nome")
    .eq("id", novoId)
    .maybeSingle();
  const { data: antigo } = await supabase
    .from("itens")
    .select("id, codigo_queops, nome")
    .eq("id", antigoId)
    .maybeSingle();
  if (!novo || !antigo) return { error: "Algum dos itens não foi encontrado." };

  // Repointa ficha_items do novo pro antigo
  const { error: upFichaErr } = await supabase
    .from("ficha_item")
    .update({ item_id: antigoId })
    .eq("item_id", novoId);
  if (upFichaErr) return { error: `Falha ao mover fichas: ${upFichaErr.message}` };

  // Atualiza antigo com código do novo (e nome do novo se solicitado)
  const patch: { codigo_queops: string | null; mrp_revisado: boolean; nome?: string } = {
    codigo_queops: novo.codigo_queops,
    mrp_revisado: true,
  };
  if (manterNomeNovo) patch.nome = novo.nome;

  const { error: upAntigoErr } = await supabase
    .from("itens")
    .update(patch)
    .eq("id", antigoId);
  if (upAntigoErr) {
    // Tenta rollback do ficha_item (best effort — pode falhar se algo já mudou)
    await supabase.from("ficha_item").update({ item_id: novoId }).eq("item_id", antigoId);
    return { error: `Falha ao atualizar item antigo: ${upAntigoErr.message}` };
  }

  // Apaga o item novo (vazio agora)
  const { error: delErr } = await supabase.from("itens").delete().eq("id", novoId);
  if (delErr) {
    return {
      error: `Itens consolidados, mas falhou ao apagar o duplicado: ${delErr.message}`,
    };
  }

  revalidatePath("/mrp/materias-primas/revisar");
  revalidatePath("/mrp/materias-primas");
  revalidatePath("/itens");
  return {};
}

/**
 * Marca um item como "revisado" sem consolidar — quando o usuário confirmou
 * que os 2 itens NÃO são duplicatas (é tudo separado, manter como está).
 */
export async function marcarRevisadoAction(itemId: string): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("itens")
    .update({ mrp_revisado: true })
    .eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/mrp/materias-primas/revisar");
  return {};
}
