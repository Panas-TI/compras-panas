"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

async function assertAprovador() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || !["aprovador", "comprador"].includes(profile.role)) {
    return { ok: false as const, error: "Apenas aprovador ou comprador podem fazer essa ação." };
  }
  return { ok: true as const, userId: user.id, email: user.email ?? "" };
}

/**
 * Re-autentica a senha do usuário sem afetar a sessão atual.
 * Usa cliente Supabase temporário (não persiste cookies/sessão).
 */
async function verificarSenha(email: string, senha: string): Promise<boolean> {
  if (!email || !senha) return false;
  try {
    const temp = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error } = await temp.auth.signInWithPassword({ email, password: senha });
    return !error;
  } catch {
    return false;
  }
}

export async function atribuirMotoristaAction(
  entregaId: string,
  motoristaId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("entregas")
    .update({ motorista_id: motoristaId })
    .eq("id", entregaId);
  if (error) return { error: error.message };
  revalidatePath("/entregas/dia");
  return {};
}

export async function excluirEntregaAction(
  entregaId: string,
  senha: string
): Promise<{ error?: string }> {
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };
  if (!senha) return { error: "Digite sua senha pra confirmar." };

  // Re-autentica a senha antes de excluir (proteção contra cliques acidentais
  // e contra sessão deixada aberta sem dono)
  const senhaOk = await verificarSenha(guard.email, senha);
  if (!senhaOk) return { error: "Senha incorreta." };

  const supabase = await createClient();
  const { error } = await supabase.from("entregas").delete().eq("id", entregaId);
  if (error) return { error: error.message };
  revalidatePath("/entregas/dia");
  return {};
}
