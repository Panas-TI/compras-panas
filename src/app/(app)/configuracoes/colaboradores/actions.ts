"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Não autenticado.";
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || p.role !== "aprovador") return "Apenas administradores gerenciam colaboradores.";
  return null;
}

/** Vazio vira null, nunca "" — senão o banco guarda string vazia como se fosse valor. */
const limpo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || null;
};

export type EstadoColaborador = { error?: string; ok?: string } | null;

export async function salvarColaboradorAction(
  _prev: EstadoColaborador,
  formData: FormData
): Promise<EstadoColaborador> {
  const supabase = await createClient();
  const erro = await assertAdmin(supabase);
  if (erro) return { error: erro };

  const id = limpo(formData.get("id"));
  const nome = limpo(formData.get("nome"));
  if (!nome) return { error: "O nome é obrigatório." };

  const ativo = formData.get("ativo") === "on";
  const desligamento = limpo(formData.get("data_desligamento"));

  // O banco recusa desligamento com ativo=true; explicar aqui é melhor do que
  // devolver a violação crua da constraint.
  if (desligamento && ativo) {
    return { error: "Quem tem data de desligamento não pode ficar marcado como ativo." };
  }

  const dados = {
    nome,
    cargo: limpo(formData.get("cargo")),
    setor: limpo(formData.get("setor")),
    telefone: limpo(formData.get("telefone")),
    email: limpo(formData.get("email"))?.toLowerCase() ?? null,
    data_admissao: limpo(formData.get("data_admissao")),
    data_desligamento: desligamento,
    observacoes: limpo(formData.get("observacoes")),
    profile_id: limpo(formData.get("profile_id")),
    ativo,
  };

  const { error } = id
    ? await supabase.from("colaboradores").update(dados).eq("id", id)
    : await supabase.from("colaboradores").insert(dados);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Essa conta de acesso já está ligada a outro colaborador."
          : error.message,
    };
  }

  revalidatePath("/configuracoes/colaboradores");
  revalidatePath("/configuracoes");
  return { ok: id ? `${nome} atualizado.` : `${nome} cadastrado.` };
}

export async function alternarAtivoColaboradorAction(
  id: string,
  novoAtivo: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const erro = await assertAdmin(supabase);
  if (erro) return { error: erro };

  // Reativar limpa o desligamento; a constraint do banco não deixaria os dois
  // conviverem, e um sem o outro deixaria o cadastro contando história errada.
  const patch = novoAtivo
    ? { ativo: true, data_desligamento: null }
    : { ativo: false };

  const { error } = await supabase.from("colaboradores").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/colaboradores");
  return {};
}
