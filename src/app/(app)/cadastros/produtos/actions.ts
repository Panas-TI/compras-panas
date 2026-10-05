"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Quem pode mexer no cadastro de produto.
 *
 * Mesma lista da política do banco (produto_all). Repetida aqui de propósito:
 * a trava do banco é a que vale, esta existe pra dar uma mensagem que explica,
 * em vez de um erro cru de RLS.
 */
const PAPEIS = ["aprovador", "comprador", "gestor_producao"];

export const TIPOS = [
  { v: "final", label: "Produto acabado", ajuda: "vai pra venda" },
  { v: "intermediario", label: "Recheio ou massa", ajuda: "abastece a produção" },
] as const;

/** Unidades limpas. As numéricas que existem no cadastro são lixo de importação. */
export const UNIDADES = ["UN", "KG", "G", "L", "ML"] as const;

async function guard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." as const };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS.includes(p.role)) return { erro: "Sem permissão." as const };
  return { supabase };
}

function limpar(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim().toUpperCase();
  const tipo = String(fd.get("tipo") ?? "");
  const categoria = String(fd.get("categoria") ?? "").trim().toUpperCase();
  const unidade = String(fd.get("unidade") ?? "UN").trim();
  const idealBruto = String(fd.get("estoque_seguranca") ?? "").trim();

  if (!nome) return { erro: "Informe o nome do produto." };
  if (!TIPOS.some((t) => t.v === tipo)) return { erro: "Escolha se é produto acabado ou recheio/massa." };
  if (!categoria) return { erro: "Escolha ou escreva uma categoria." };

  // Vírgula é como se digita aqui; o banco quer ponto.
  const ideal = idealBruto ? Number(idealBruto.replace(",", ".")) : null;
  if (ideal !== null && (!Number.isFinite(ideal) || ideal < 0)) {
    return { erro: "Estoque ideal inválido." };
  }
  return { dados: { nome, tipo, categoria, unidade_producao: unidade, estoque_seguranca: ideal } };
}

export type FormState = { error?: string; ok?: string } | null;

export async function criarProdutoAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await guard();
  if ("erro" in g) return { error: g.erro };
  const r = limpar(fd);
  if ("erro" in r) return { error: r.erro };

  // Nome repetido é o começo do estrago: dois cadastros do mesmo produto
  // dividem a contagem e o planejamento, e ninguém percebe até os números não
  // fecharem. O banco não tem unique aqui, então a checagem é esta.
  const { data: existe } = await g.supabase
    .from("produto")
    .select("id, nome, ativo, tipo")
    .ilike("nome", r.dados.nome)
    .maybeSingle();
  if (existe) {
    return {
      error: existe.ativo
        ? `Já existe um produto chamado "${existe.nome}". Use aquele em vez de criar outro.`
        : `Já existe "${existe.nome}", desativado. Reative em vez de criar um novo.`,
    };
  }

  const { error } = await g.supabase.from("produto").insert(r.dados);
  if (error) return { error: error.message };
  revalidatePath("/cadastros/produtos");
  revalidatePath("/pcp/planejar");
  return { ok: `${r.dados.nome} cadastrado.` };
}

export async function salvarProdutoAction(id: string, fd: FormData): Promise<{ error?: string }> {
  const g = await guard();
  if ("erro" in g) return { error: g.erro };
  const r = limpar(fd);
  if ("erro" in r) return { error: r.erro };

  const { data: outro } = await g.supabase
    .from("produto")
    .select("id")
    .ilike("nome", r.dados.nome)
    .neq("id", id)
    .maybeSingle();
  if (outro) return { error: `Já existe outro produto com o nome "${r.dados.nome}".` };

  const { error } = await g.supabase
    .from("produto")
    .update({ ...r.dados, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/cadastros/produtos");
  revalidatePath("/pcp/planejar");
  return {};
}

/**
 * Desativar, nunca apagar.
 *
 * O produto está amarrado em planos de produção e contagens antigas; apagar
 * levaria o histórico junto. Desativado ele some das listas novas e o passado
 * continua de pé.
 */
export async function alternarAtivoAction(id: string, ativo: boolean): Promise<{ error?: string }> {
  const g = await guard();
  if ("erro" in g) return { error: g.erro };
  const { error } = await g.supabase.from("produto").update({ ativo }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/cadastros/produtos");
  revalidatePath("/pcp/planejar");
  return {};
}
