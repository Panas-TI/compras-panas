"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { calcularAdiarAte, JANELA_EDICAO_DIAS, diasDesde, RESULTADOS } from "./contato-regras";

const PAPEIS = ["aprovador", "vendas"];

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
 * Corrige um contato já registrado — o caso do cliente que responde depois.
 *
 * Existe porque o registro nascia fechado: quem mandava zap às 10h e marcava
 * "ainda sem resposta" não tinha onde colocar a resposta das 12h. A venda
 * acontecia e o histórico seguia dizendo que o cliente não respondeu.
 *
 * É UPDATE, nunca INSERT — de propósito. O placar do dia conta linhas criadas
 * hoje; se corrigir criasse linha, corrigir viraria produtividade.
 *
 * As duas travas contra reescrever história ficam AQUI, no servidor, e não na
 * tela: só o contato mais recente do cliente, e só dentro da janela.
 */
export async function atualizarContatoAction(input: {
  id: string;
  resultado: string;
  motivo?: string | null;
  observacao?: string | null;
  canal?: string | null;
  /** Data escolhida à mão. Ignorada quando o resultado é "comprou". */
  adiarAte?: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  // Resultado desconhecido cairia no `?? 0` do cálculo de retorno e gravaria
  // adiar_ate = null. Isso NÃO é inofensivo: a fila de retorno do plano do dia
  // só enxerga linhas com adiar_ate preenchido, então zerar a data da linha
  // mais nova faz um combinado ANTIGO, já resolvido, voltar a valer. Recusar
  // aqui é mais barato do que descobrir depois.
  if (!RESULTADOS.some((r) => r.v === input.resultado)) {
    return { error: "Resultado inválido." };
  }

  const { data: atual, error: errBusca } = await supabase
    .from("vendas_contatos")
    .select("id, cliente_id, resultado, criado_em")
    .eq("id", input.id)
    .maybeSingle();
  if (errBusca) return { error: errBusca.message };
  if (!atual) return { error: "Contato não encontrado." };

  if (diasDesde(atual.criado_em) > JANELA_EDICAO_DIAS) {
    return {
      error: `Este contato tem mais de ${JANELA_EDICAO_DIAS} dias. Registre um contato novo em vez de corrigir o antigo.`,
    };
  }

  // Só o mais recente do cliente. Corrigir um contato que já foi sucedido por
  // outro deixaria o histórico contando duas versões da mesma conversa.
  const { data: maisRecente, error: errRecente } = await supabase
    .from("vendas_contatos")
    .select("id")
    .eq("cliente_id", atual.cliente_id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Falha fechada. Com `if (maisRecente && ...)` sozinho, um timeout do
  // PostgREST — que este projeto já viu — pulava a trava inteira e deixava
  // reescrever um contato que outra pessoa já sucedeu. O trigger no banco
  // também barra, mas a mensagem de lá não explica nada pro vendedor.
  if (errRecente || !maisRecente) {
    return { error: "Não deu pra confirmar se este é o contato mais recente. Tente de novo." };
  }
  if (maisRecente.id !== atual.id) {
    return { error: "Já existe um contato mais novo com este cliente. Corrija aquele." };
  }

  const { data: cliente } = await supabase
    .from("vendas_clientes")
    .select("intervalo_mediano_dias")
    .eq("id", atual.cliente_id)
    .maybeSingle();

  const patch: Database["public"]["Tables"]["vendas_contatos"]["Update"] = {
    resultado: input.resultado,
    adiar_ate: calcularAdiarAte(
      input.resultado,
      cliente?.intervalo_mediano_dias ?? null,
      input.adiarAte
    ),
    // atualizado_em, resultado_inicial e corrigido_por são carimbados pelo
    // trigger no banco — não aqui. Assim o rastro existe por qualquer caminho,
    // inclusive numa chamada crua ao PostgREST, e a hora vem do relógio do
    // banco, o mesmo que gravou criado_em.
  };
  // Campo ausente ≠ campo apagado. Os botões de um clique da bandeja mandam só
  // o resultado; se o `undefined` deles virasse null, a observação que o
  // vendedor escreveu de manhã ("mandei zap 10h") sumiria ao corrigir à tarde.
  if (input.motivo !== undefined) patch.motivo = input.motivo?.trim() || null;
  if (input.observacao !== undefined) patch.observacao = input.observacao?.trim() || null;
  if (input.canal) patch.canal = input.canal;

  const { error } = await supabase.from("vendas_contatos").update(patch).eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  revalidatePath(`/vendas/clientes/${atual.cliente_id}`);
  revalidatePath("/vendas/contatos");
  return {};
}
