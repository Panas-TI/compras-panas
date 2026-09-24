"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PAPEIS = ["aprovador", "vendas"];

/**
 * Define (ou limpa) os dias em que este cliente deve ser chamado.
 *
 * Lista vazia chega aqui como "tirar a agenda" e grava null, não `{}`: os dois
 * são estados diferentes no banco, e `{}` significaria "nunca ligar" — jeito
 * silencioso de sumir com um cliente. Quem não deve mais ser chamado se
 * desativa, e isso aparece na tela.
 */
export async function definirDiasContatoAction(
  clienteId: string,
  dias: number[]
): Promise<{ error?: string }> {
  // Normaliza antes de gravar: ordena e tira repetido. O banco recusaria o
  // repetido de qualquer jeito, mas com uma mensagem de constraint que não
  // diz nada pro vendedor.
  const limpos = Array.from(new Set(dias)).sort((a, b) => a - b);
  if (limpos.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    return { error: "Dia inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS.includes(p.role)) return { error: "Sem permissão." };

  const { error } = await supabase
    .from("vendas_clientes")
    .update({ dias_contato: limpos.length > 0 ? limpos : null })
    .eq("id", clienteId);
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  revalidatePath(`/vendas/clientes/${clienteId}`);
  return {};
}
