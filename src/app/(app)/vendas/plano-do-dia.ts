import { createClient } from "@/lib/supabase/server";
import type { ItemHabitual } from "./ui";

/**
 * Tamanho alvo da lista diária.
 *
 * A meta de R$ 45 mil exige ~28 pedidos por dia útil no ticket atual. Sem saber
 * ainda quantos contatos viram venda, 50 é o ponto de partida: cobre os
 * vencidos, os previstos e ainda puxa reativação. Calibrar depois de duas
 * semanas com conversão medida.
 */
export const TAMANHO_LISTA = 50;

export type ClienteDoPlano = {
  id: string;
  nome: string;
  status: string;
  motivo_contato: string | null;
  telefone_e164: string | null;
  telefone_raw: string | null;
  telefone_presumido: boolean;
  canal_preferido: string | null;
  ultima_compra: string | null;
  intervalo_mediano_dias: number | null;
  ticket_medio: number;
  itens_habituais: ItemHabitual[] | null;
  /** De onde veio na composição do dia. */
  faixa: "escolhido" | "retorno" | "vencido" | "previsto" | "novo" | "reativacao";
  /** Só na faixa "escolhido": por que alguém puxou este cliente. */
  motivoManual?: string | null;
  /** Só na faixa "retorno": o combinado que venceu. */
  combinado: { resultado: string; adiarAte: string; observacao: string | null } | null;
  /** Produto que ele comprava e parou — a munição do vendedor. */
  oportunidade: { produto: string; vezes: number; dias: number } | null;
  /** Já foi trabalhado hoje? */
  trabalhado: boolean;
};

const CAMPOS =
  "id, nome, status, motivo_contato, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, ticket_medio, receita_anual_risco, itens_habituais";

/**
 * Monta o plano do dia.
 *
 * A fila natural rende só ~6 clientes por dia; o resto da lista era acúmulo de
 * atrasados que nunca zerava. Aqui a lista tem tamanho definido: o que vence e
 * o que atrasou vêm primeiro, e a cota de reativação completa até o alvo — é o
 * que faz os 292 inativos serem efetivamente trabalhados em vez de apodrecerem
 * numa aba separada que ninguém abre.
 */
export async function montarPlanoDoDia(): Promise<{
  lista: ClienteDoPlano[];
  trabalhados: number;
  totalReativacao: number;
}> {
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: fila }, { data: adiados }, { data: oport }, { data: contatosHoje }, { data: todosContatos }] =
    await Promise.all([
      supabase.from("vendas_clientes").select(CAMPOS).eq("contatar_3dias", true).eq("ativo", true),
      supabase.from("vendas_contatos").select("cliente_id").gte("adiar_ate", hoje),
      supabase.rpc("vendas_oportunidades"),
      supabase
        .from("vendas_contatos")
        .select("cliente_id")
        .gte("criado_em", `${hoje}T00:00:00`),
      supabase
        .from("vendas_contatos")
        .select("cliente_id, resultado, adiar_ate, observacao, criado_em")
        .not("adiar_ate", "is", null)
        .order("criado_em", { ascending: false }),
    ]);

  const silenciados = new Set((adiados ?? []).map((a) => a.cliente_id));
  const trabalhadosHoje = new Set((contatosHoje ?? []).map((c) => c.cliente_id));
  const oportPorCliente = new Map(
    (oport ?? []).map((o) => [
      o.cliente_id,
      { produto: o.produto, vezes: o.vezes, dias: o.dias_sem_pedir },
    ])
  );

  type Bruto = (typeof fila extends (infer T)[] | null ? T : never) & Record<string, unknown>;
  const monta = (
    c: Bruto,
    faixa: ClienteDoPlano["faixa"],
    combinado: ClienteDoPlano["combinado"] = null
  ): ClienteDoPlano => ({
    ...(c as unknown as Omit<ClienteDoPlano, "faixa" | "oportunidade" | "trabalhado" | "combinado">),
    itens_habituais: (c.itens_habituais as ItemHabitual[] | null) ?? null,
    faixa,
    combinado,
    oportunidade: oportPorCliente.get(c.id as string) ?? null,
    trabalhado: trabalhadosHoje.has(c.id as string),
  });

  // 0) Puxados à mão. Vêm na frente de tudo: alguém decidiu falar com este
  //    cliente hoje, por um motivo que o sistema não conhece. Passa por cima
  //    de adiamento e de qualquer regra de ciclo — é uma decisão humana.
  const { data: manuais } = await supabase
    .from("vendas_fila_manual")
    .select("cliente_id, motivo")
    .eq("data", hoje);

  const escolhidos: ClienteDoPlano[] = [];
  const motivoManual = new Map((manuais ?? []).map((m) => [m.cliente_id, m.motivo]));
  if (motivoManual.size > 0) {
    const { data: cls } = await supabase
      .from("vendas_clientes")
      .select(CAMPOS)
      .in("id", Array.from(motivoManual.keys()))
      .eq("ativo", true);
    for (const c of cls ?? []) {
      const item = monta(c as Bruto, "escolhido");
      item.motivoManual = motivoManual.get(c.id) ?? null;
      escolhidos.push(item);
    }
  }
  const jaEscolhido = new Set(escolhidos.map((c) => c.id));

  // 1) Retornos combinados — a data que o vendedor prometeu chegou.
  //
  // Sem isto, `adiar_ate` só tirava da lista e nunca recolocava: quem voltava
  // era só quem por acaso caía de novo na fila natural. Cliente que disse
  // "me liga amanhã" e não estava vencido pelo ciclo simplesmente sumia, e a
  // promessa morria sem ninguém saber.
  const ultimoCombinado = new Map<string, { resultado: string; adiar_ate: string; observacao: string | null; criado_em: string }>();
  for (const c of todosContatos ?? []) {
    // Vem ordenado do mais recente pro mais antigo: o primeiro de cada cliente
    // é o que vale. Combinado antigo não ressuscita.
    if (c.cliente_id && !ultimoCombinado.has(c.cliente_id)) {
      ultimoCombinado.set(c.cliente_id, {
        resultado: c.resultado ?? "",
        adiar_ate: String(c.adiar_ate),
        observacao: c.observacao,
        criado_em: String(c.criado_em),
      });
    }
  }

  const idsRetorno = Array.from(ultimoCombinado.entries())
    .filter(([, v]) => v.adiar_ate < hoje)
    .map(([id]) => id);

  const retornos: ClienteDoPlano[] = [];
  if (idsRetorno.length > 0) {
    const { data: clientesRetorno } = await supabase
      .from("vendas_clientes")
      .select(CAMPOS)
      .in("id", idsRetorno)
      .eq("ativo", true);

    for (const c of clientesRetorno ?? []) {
      const comb = ultimoCombinado.get(c.id)!;
      // Comprou depois do contato: o combinado se resolveu sozinho. Volta pelo
      // ciclo normal, não como cobrança de promessa.
      const compradoDepois =
        c.ultima_compra && String(c.ultima_compra) >= comb.criado_em.slice(0, 10);
      if (compradoDepois || jaEscolhido.has(c.id)) continue;
      retornos.push(
        monta(c as Bruto, "retorno", {
          resultado: comb.resultado,
          adiarAte: comb.adiar_ate,
          observacao: comb.observacao,
        })
      );
    }
    // Mais atrasado primeiro: a promessa mais velha é a que mais corrói.
    retornos.sort((a, b) => (a.combinado!.adiarAte < b.combinado!.adiarAte ? -1 : 1));
  }

  const jaEmRetorno = new Set(retornos.map((c) => c.id));

  // 2) Fila natural, sem quem combinou de voltar depois e sem repetir retorno.
  const disponiveis = (fila ?? []).filter(
    (c) => !silenciados.has(c.id) && !jaEmRetorno.has(c.id) && !jaEscolhido.has(c.id)
  );

  const vencidos = disponiveis
    .filter((c) => c.motivo_contato?.startsWith("vencido"))
    .sort((a, b) => Number(b.ticket_medio ?? 0) - Number(a.ticket_medio ?? 0))
    .map((c) => monta(c as Bruto, "vencido"));

  const previstos = disponiveis
    .filter((c) => c.motivo_contato?.startsWith("previsto"))
    .sort((a, b) => Number(b.ticket_medio ?? 0) - Number(a.ticket_medio ?? 0))
    .map((c) => monta(c as Bruto, "previsto"));

  const novos = disponiveis
    .filter((c) => c.motivo_contato?.startsWith("cliente novo"))
    .map((c) => monta(c as Bruto, "novo"));

  const base = [...escolhidos, ...retornos, ...vencidos, ...previstos, ...novos];

  // 3) Cota de reativação: completa até o alvo, do maior valor em risco pro
  //    menor. Sem isso o backlog de inativos nunca é tocado.
  const faltam = Math.max(0, TAMANHO_LISTA - base.length);
  const jaNaLista = new Set(base.map((c) => c.id));

  // Inclui 'sem_padrao' junto de 'inativo' de propósito.
  //
  // Cliente de 1 compra deixou de ser marcado como inativo — não dá pra dizer
  // que quebrou um ritmo que nunca teve. Mas se ficasse só nesse rótulo, sairia
  // da fila E da reativação: sumiria de todas as telas e ninguém falaria com
  // ele nunca mais. A cota recolhe os dois grupos.
  const { data: inativos, count: totalReativacao } = await supabase
    .from("vendas_clientes")
    .select(CAMPOS, { count: "exact" })
    .eq("ativo", true)
    .in("status", ["inativo", "sem_padrao"])
    .not("ultima_compra", "is", null)
    .order("receita_anual_risco", { ascending: false, nullsFirst: false })
    .limit(faltam + silenciados.size + jaNaLista.size + 20);

  const reativacao = (inativos ?? [])
    .filter((c) => !jaNaLista.has(c.id) && !silenciados.has(c.id) && !jaEscolhido.has(c.id))
    .slice(0, faltam)
    .map((c) => monta(c as Bruto, "reativacao"));

  const lista = [...base, ...reativacao];

  return {
    lista,
    trabalhados: lista.filter((c) => c.trabalhado).length,
    totalReativacao: totalReativacao ?? 0,
  };
}
