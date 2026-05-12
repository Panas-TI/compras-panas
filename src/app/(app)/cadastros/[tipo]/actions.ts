"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOOKUP_CONFIG, type LookupTipo } from "./config";

export type LookupFormState = { error?: string } | null;

export async function createLookupAction(tipo: LookupTipo, _prev: LookupFormState, fd: FormData): Promise<LookupFormState> {
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe um nome." };

  const supabase = await createClient();
  const table = LOOKUP_CONFIG[tipo].table;
  const { error } = await supabase.from(table).insert({ nome });
  if (error) {
    if (error.code === "23505") return { error: "Já existe um registro com esse nome." };
    return { error: error.message };
  }
  revalidatePath(`/cadastros/${tipo}`);
  return null;
}

export async function renameLookupAction(
  tipo: LookupTipo,
  id: string,
  novoNome: string
): Promise<{ error?: string }> {
  const nome = novoNome.trim();
  if (!nome) return { error: "Nome obrigatório." };
  const supabase = await createClient();
  const table = LOOKUP_CONFIG[tipo].table;
  const { error } = await supabase.from(table).update({ nome }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Já existe um registro com esse nome." };
    return { error: error.message };
  }
  revalidatePath(`/cadastros/${tipo}`);
  return {};
}

export async function toggleLookupAtivoAction(tipo: LookupTipo, id: string, novoStatus: boolean) {
  const supabase = await createClient();
  const table = LOOKUP_CONFIG[tipo].table;
  const { error } = await supabase.from(table).update({ ativo: novoStatus }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/cadastros/${tipo}`);
}
