"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type CreateUserState = { error?: string; ok?: string } | null;

function adminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function assertAprovador(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") {
    return { ok: false, error: "Apenas aprovadores podem gerenciar usuários." };
  }
  return { ok: true };
}

export async function criarUsuarioAction(
  _prev: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const role = String(formData.get("role") ?? "comprador") as "comprador" | "aprovador";

  if (!email || !senha || !nome) return { error: "Email, senha e nome são obrigatórios." };
  if (senha.length < 6) return { error: "Senha precisa ter pelo menos 6 caracteres." };
  if (role !== "comprador" && role !== "aprovador") return { error: "Role inválido." };

  const admin = adminClient();

  // 1. Cria o usuário via Auth Admin API (trigger cria profile com ativo=false, role=comprador)
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (authErr) {
    if (authErr.message.toLowerCase().includes("already")) {
      return { error: "Já existe um usuário com esse email." };
    }
    return { error: authErr.message };
  }

  // 2. Atualiza profile com role + ativa
  const { error: updErr } = await admin
    .from("profiles")
    .update({ nome, role, ativo: true })
    .eq("id", created.user!.id);

  if (updErr) return { error: `Usuário criado mas falha ao ativar: ${updErr.message}` };

  revalidatePath("/usuarios");
  return { ok: `Usuário ${email} criado e ativado como ${role}.` };
}

export async function toggleAtivoAction(profileId: string, novoStatus: boolean): Promise<{ error?: string }> {
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };

  const admin = adminClient();
  const { error } = await admin.from("profiles").update({ ativo: novoStatus }).eq("id", profileId);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}

export async function alterarRoleAction(profileId: string, novoRole: "comprador" | "aprovador"): Promise<{ error?: string }> {
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };

  const admin = adminClient();
  const { error } = await admin.from("profiles").update({ role: novoRole }).eq("id", profileId);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}

export async function resetarSenhaAction(profileId: string, novaSenha: string): Promise<{ error?: string }> {
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };
  if (novaSenha.length < 6) return { error: "Senha precisa ter pelo menos 6 caracteres." };

  const admin = adminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, { password: novaSenha });
  if (error) return { error: error.message };
  return {};
}
