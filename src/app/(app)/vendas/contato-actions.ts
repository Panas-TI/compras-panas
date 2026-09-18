"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { MOTIVO_OUTRO } from "./ui";
import {
  calcularAdiarAte,
  JANELA_EDICAO_DIAS,
  dentroDaJanela,
  hojeMais,
  RESULTADOS,
} from "./contato-regras";

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

  // Mesma regra do formulário. O action é endpoint público: sem isto,
  // { motivo: "Outro", observacao: "" } grava a linha inútil que a lista
  // fechada de motivos existe pra impedir.
  if (input.motivo === MOTIVO_OUTRO && !input.observacao?.trim()) {
    return { error: "Escolheu “Outro” — escreva o que o cliente disse." };
  }

  const { data: atual, error: errBusca } = await supabase
    .from("vendas_contatos")
    .select("id, cliente_id, prospect_id, resultado, criado_em")
    .eq("id", input.id)
    .maybeSingle();
  if (errBusca) return { error: errBusca.message };
  if (!atual) return { error: "Contato não encontrado." };

  // Mesma conta da tela e do trigger: instantes, não dias inteiros.
  if (!dentroDaJanela(atual.criado_em)) {
    return {
      error: `Este contato tem mais de ${JANELA_EDICAO_DIAS} dias. Registre um contato novo em vez de corrigir o antigo.`,
    };
  }

  // O contato agora pode ser de um cliente OU de um prospect — nunca dos dois,
  // garantido por constraint no banco. A regra do "mais recente" vale para o
  // dono do contato, seja ele qual for.
  const alvo: { coluna: "cliente_id" | "prospect_id"; id: string } = atual.cliente_id
    ? { coluna: "cliente_id", id: atual.cliente_id }
    : { coluna: "prospect_id", id: atual.prospect_id! };

  // Só o mais recente do dono. Corrigir um contato que já foi sucedido por
  // outro deixaria o histórico contando duas versões da mesma conversa.
  const { data: maisRecente, error: errRecente } = await supabase
    .from("vendas_contatos")
    .select("id")
    .eq(alvo.coluna, alvo.id)
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
    return {
      error: `Já existe um contato mais novo com este ${alvo.coluna === "cliente_id" ? "cliente" : "prospect"}. Corrija aquele.`,
    };
  }

  // Ciclo de recompra só existe para quem já comprou. Prospect não tem, e aí o
  // retorno cai no prazo padrão do resultado em vez de um ciclo inventado.
  const { data: cliente } = atual.cliente_id
    ? await supabase
        .from("vendas_clientes")
        .select("intervalo_mediano_dias")
        .eq("id", atual.cliente_id)
        .maybeSingle()
    : { data: null };

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
  if (atual.cliente_id) {
    revalidatePath("/vendas/clientes");
    revalidatePath(`/vendas/clientes/${atual.cliente_id}`);
  } else {
    revalidatePath("/vendas/prospects");
    revalidatePath(`/vendas/prospects/${atual.prospect_id}`);
  }
  revalidatePath("/vendas/contatos");
  return {};
}


/**
 * Registrar contato em um clique, sem formulário.
 *
 * O fluxo real é: digita a mensagem, manda pro cliente, segue pro próximo. Quem
 * está mandando vinte mensagens não quer preencher canal, resultado e motivo em
 * cada uma — e aos 90% que não respondem na hora não há nada a classificar
 * ainda. O contato nasce como "ainda sem resposta" e o cliente cai na bandeja;
 * a classificação acontece lá, conforme as respostas chegam.
 */
export async function registrarContatoRapidoAction(
  clienteId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  // Clicar duas vezes no mesmo cliente não pode virar dois contatos: o placar
  // do dia conta cliente falado, e o histórico viraria conversa em duplicata.
  const { data: jaHoje } = await supabase
    .from("vendas_contatos")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("resultado", "sem_resposta")
    .gte("criado_em", `${hojeMais(0)}T00:00:00-03:00`)
    .limit(1)
    .maybeSingle();
  if (jaHoje) return {};

  const { error } = await supabase.from("vendas_contatos").insert({
    cliente_id: clienteId,
    usuario_id: g.userId,
    // Canal e motivo ficam pra bandeja: aqui ainda não há o que classificar.
    canal: null,
    resultado: "sem_resposta",
    adiar_ate: calcularAdiarAte("sem_resposta", null, null),
  });
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  revalidatePath(`/vendas/clientes/${clienteId}`);
  return {};
}
