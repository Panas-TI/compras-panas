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
  if (!p?.ativo || !PAPEIS.includes(p.role))
    return { erro: "Sem permissão para planejar a produção." };
  return { userId: user.id };
}

export type TurnoEntrada = {
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  colaboradores: string[];
  linhas: { produto_id: string; quantidade: number }[];
};

/**
 * Grava o plano do dia inteiro de uma vez.
 *
 * Apaga os turnos e regrava em vez de tentar casar o que mudou: o plano é
 * pequeno (dois ou três turnos) e a alternativa — diferenciar linha a linha —
 * abriria espaço pra estado parcial se algo falhasse no meio.
 */
export async function salvarPCPAction(
  data: string,
  turnos: TurnoEntrada[],
  observacoes: string | null
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Data inválida." };

  for (const t of turnos) {
    if (!t.nome.trim()) return { error: "Todo turno precisa de um nome." };
    if (t.hora_fim <= t.hora_inicio)
      return { error: `No turno "${t.nome}", o fim precisa ser depois do início.` };
    const vistos = new Set<string>();
    for (const l of t.linhas) {
      if (vistos.has(l.produto_id))
        return { error: `O turno "${t.nome}" tem o mesmo produto duas vezes.` };
      vistos.add(l.produto_id);
      if (!(l.quantidade > 0))
        return { error: `No turno "${t.nome}", a quantidade precisa ser maior que zero.` };
    }
  }

  // Um plano por data: reaproveita o existente pra não colidir com o índice.
  const { data: existente } = await supabase
    .from("pcp_dia")
    .select("id")
    .eq("data", data)
    .maybeSingle();

  let pcpId = existente?.id ?? null;
  if (pcpId) {
    const { error } = await supabase
      .from("pcp_dia")
      .update({ observacoes })
      .eq("id", pcpId);
    if (error) return { error: error.message };
    // CASCADE leva turnos, equipe e linhas junto.
    await supabase.from("pcp_turno").delete().eq("pcp_id", pcpId);
  } else {
    const { data: novo, error } = await supabase
      .from("pcp_dia")
      .insert({ data, observacoes, criado_por: g.userId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    pcpId = novo!.id;
  }

  for (const [i, t] of turnos.entries()) {
    const { data: turno, error: tErr } = await supabase
      .from("pcp_turno")
      .insert({
        pcp_id: pcpId,
        nome: t.nome.trim(),
        hora_inicio: t.hora_inicio,
        hora_fim: t.hora_fim,
        ordem: i + 1,
      })
      .select("id")
      .single();
    if (tErr) return { error: `Erro gravando "${t.nome}": ${tErr.message}` };

    if (t.colaboradores.length > 0) {
      const { error } = await supabase.from("pcp_turno_colaborador").insert(
        t.colaboradores.map((colaborador_id) => ({ turno_id: turno!.id, colaborador_id }))
      );
      if (error) return { error: `Erro gravando a equipe de "${t.nome}": ${error.message}` };
    }

    if (t.linhas.length > 0) {
      const { error } = await supabase.from("pcp_linha").insert(
        t.linhas.map((l) => ({
          turno_id: turno!.id,
          produto_id: l.produto_id,
          quantidade: l.quantidade,
        }))
      );
      if (error) return { error: `Erro gravando os produtos de "${t.nome}": ${error.message}` };
    }
  }

  revalidatePath("/pcp");
  revalidatePath("/pcp/planejar");
  return { ok: true };
}

export async function apagarPCPAction(data: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };
  const { error } = await supabase.from("pcp_dia").delete().eq("data", data);
  if (error) return { error: error.message };
  revalidatePath("/pcp");
  return {};
}
