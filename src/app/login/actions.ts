"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { error: "Informe email e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    return { error: "Email ou senha incorretos." };
  }

  // Verify user has an active profile (RLS-friendly check)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Falha ao recuperar usuário." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.ativo) {
    await supabase.auth.signOut();
    return {
      error: "Sua conta ainda não está liberada. Peça pro aprovador ativar.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
