import { createClient } from "@/lib/supabase/server";
import { diaEmSP, inicioDoDiaSP, TENTATIVAS_ATE_PARAR } from "./contato-regras";
import { temAgenda, hojeEhDiaDeContato } from "./rota-regras";
import type { ItemHabitual } from "./ui";
import type { Rota } from "./rota-regras";

/**
 * Tamanho alvo da lista diária.
 *
 * A meta de R$ 45 mil exige ~28 pedidos por dia útil no ticket atual. Sem saber
 * ainda quantos contatos viram venda, 50 é o ponto de partida: cobre os
 * vencidos, os previstos e ainda puxa reativação. Calibrar depois de duas
 * semanas com conversão medida.
 */
export const TAMANHO_LISTA = 50;

/** O contato mais recente do cliente, na forma mínima que as regras usam. */
export type UltimoContato = {
  adiar_ate: string | null;
  /** Null = ninguém informou desfecho. Não é pendência: é o caso normal. */
  concluidoEm: string | null;
  criado_em: string;
  /** True só quando uma pessoa escolheu a data. Palpite do sistema é false. */
  combinado: boolean;
  /** Quantas vezes já se falou com ele desde a última compra. */
  tentativas: number;
};

/**
 * Já se tentou demais sem pedido nenhum?
 *
 * Quem passa daqui sai da lista do dia e vai pra tela "não está fechando".
 * Ligar uma quinta vez pra quem não comprou nas quatro anteriores não é
 * persistência — é ocupar a vaga de quem ainda compraria. Há cliente na base
 * com 13 tentativas sem um pedido.
 */
export function cansouDeTentar(ultimo: UltimoContato | null | undefined): boolean {
  return (ultimo?.tentativas ?? 0) >= TENTATIVAS_ATE_PARAR;
}

/**
 * Este cliente está calado hoje por decisão dele?
 *
 * Duas coisas que parecem detalhe e não são:
 *
 * - vale o ÚLTIMO contato, não qualquer um. Quando a regra olhava qualquer
 *   linha, um "não agora, volta dia 6" de duas semanas atrás seguia calando
 *   cliente falado ontem. De 49 na fila, 46 ficaram silenciados.
 * - `> hoje`, não `>= hoje`. Com `>=`, quem estava marcado pra voltar HOJE
 *   caía num vão: a fila tirava por ter data marcada e o retorno só pegava
 *   data vencida.
 */
export function silenciaHoje(ultimo: UltimoContato | null | undefined, hoje: string): boolean {
  if (!ultimo?.adiar_ate) return false;
  // Falar com alguém não pode apagar o cartão dele na sua frente.
  //
  // Um clique agenda a volta pra daqui a 2 dias, e isso silenciava o cliente
  // na mesma hora: o cartão sumia da lista, o placar não subia, e quem clicou
  // via exatamente nada acontecer. Antes a bandeja "Aguardando resposta"
  // segurava o cliente e dava o sinal; sem ela, o silêncio começava cedo
  // demais.
  //
  // O silêncio vale a partir de amanhã. Hoje o cliente fica à vista, apagado,
  // com o selo "✓ falado hoje" — que é a confirmação de que o clique pegou.
  if (diaEmSP(ultimo.criado_em) === hoje) return false;
  return String(ultimo.adiar_ate) > hoje;
}

/**
 * A data combinada chegou e o cliente tem que voltar como cobrança?
 *
 * Contato de hoje só não volta hoje enquanto ninguém o concluiu: registrar
 * contato agenda a volta sozinho, e um vencimento no mesmo dia traria de volta
 * quem você acabou de falar. Mas quando VOCÊ conclui e marca o retorno pra
 * hoje — "ele pediu pra ligar de tarde" — é decisão sua, e ele precisa
 * aparecer.
 */
export function venceuHoje(ultimo: UltimoContato, hoje: string): boolean {
  if (!ultimo.adiar_ate) return false;
  return (
    String(ultimo.adiar_ate) <= hoje &&
    (ultimo.concluidoEm !== null || diaEmSP(ultimo.criado_em) !== hoje)
  );
}

/**
 * Retorno combinado: o cliente pediu pra você voltar numa data, e a data
 * chegou. Só isto pode usar esse nome.
 *
 * Antes qualquer prazo vencido virava "retorno combinado", inclusive o que o
 * próprio sistema tinha calculado quando ninguém classificou o contato. Dos
 * 107 combinados vencidos num dia, 68 eram invenção — e como a faixa vem no
 * topo da lista, elas passavam na frente de quem estava realmente vencendo o
 * ciclo de compra. O vendedor abria a lista e via promessa que nunca houve.
 */
export function viraRetornoHoje(ultimo: UltimoContato, hoje: string): boolean {
  return ultimo.combinado && venceuHoje(ultimo, hoje);
}

/**
 * Acompanhamento: você falou, o pedido não veio, e o prazo da escada venceu.
 *
 * É o mesmo cliente que antes aparecia como "retorno combinado" — só que
 * chamado pelo nome certo, e com a contagem de tentativas à mostra, que é a
 * informação que decide se vale insistir.
 */
export function viraAcompanhamentoHoje(ultimo: UltimoContato, hoje: string): boolean {
  return !ultimo.combinado && !cansouDeTentar(ultimo) && venceuHoje(ultimo, hoje);
}

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
  /** Em que dias este cliente recebe — decide o que prometer no telefone. */
  rota: Rota;
  /** Dia da semana em que ele concentra os pedidos (1=seg…5=sex), se houver. */
  dia_pedido_habitual: number | null;
  dias_contato: number[] | null;
  /** De onde veio na composição do dia. */
  faixa:
    | "escolhido"
    | "retorno"
    | "agenda"
    | "vencido"
    | "previsto"
    | "acompanhamento"
    | "falado_hoje"
    | "novo"
    | "reativacao";
  /** Só na faixa "escolhido": por que alguém puxou este cliente. */
  motivoManual?: string | null;
  /** Só na faixa "retorno": o combinado que venceu. */
  combinado: {
    resultado: string;
    adiarAte: string;
    observacao: string | null;
    /** Quantas vezes já se falou com ele desde a última compra dele. */
    tentativas: number;
  } | null;
  /** Produto que ele comprava e parou — a munição do vendedor. */
  oportunidade: { produto: string; vezes: number; dias: number } | null;
  /** Já foi trabalhado hoje? */
  trabalhado: boolean;
};

const CAMPOS =
  "id, nome, status, motivo_contato, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, ticket_medio, receita_anual_risco, itens_habituais, rota, dia_pedido_habitual, dias_contato";

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
  // Dia civil de Porto Alegre, não UTC.
  //
  // Com toISOString() o dia virava às 21h locais: o corte de "contatos de hoje"
  // passava a ser amanhã, o placar caía de "32 de 50" pra "0 de 50", todo
  // "✓ falado hoje" sumia e os clientes puxados à mão desapareciam da lista —
  // no meio do expediente da noite. Bug que já existia; aparecia todo dia.
  const hoje = diaEmSP(new Date());

  const [
    { data: fila },
    { data: comAgenda },
    { data: oport },
    { data: contatosHoje },
    { data: ultimos },
  ] = await Promise.all([
      supabase.from("vendas_clientes").select(CAMPOS).eq("contatar_3dias", true).eq("ativo", true),
      // Consulta própria, não um filtro sobre `fila`: quem tem dia marcado
      // aparece nesse dia mesmo com o ciclo de compra em dia — é justamente o
      // sentido de marcar o dia. Vindo de `fila` (contatar_3dias = true), a
      // banca da Plínio só apareceria na segunda quando já estivesse atrasada.
      supabase
        .from("vendas_clientes")
        .select(CAMPOS)
        .not("dias_contato", "is", null)
        .eq("ativo", true),
      supabase.rpc("vendas_oportunidades"),
      supabase
        .from("vendas_contatos")
        .select("cliente_id")
        .gte("criado_em", inicioDoDiaSP(hoje)),
      // Uma linha por cliente, sempre a mais recente. Antes eram duas leituras
      // da tabela inteira de contatos, sem limite nem ordem na primeira: ao
      // passar de mil linhas o PostgREST corta em silêncio e quem ficaria de
      // fora da fila viraria sorteio.
      supabase
        .from("vendas_ultimo_contato")
        .select(
          "cliente_id, resultado, adiar_ate, observacao, criado_em, atualizado_em, concluido_em, combinado_com_cliente, tentativas"
        ),
    ]);

  // Quem cala o cliente é o ÚLTIMO contato, e só se a data ainda não chegou.
  //
  // Antes bastava QUALQUER linha do cliente com `adiar_ate >= hoje`. Dois furos,
  // e juntos secaram a lista — dos 49 clientes no ciclo de compra, 46 estavam
  // silenciados e sobravam 3; o resto da tela era reativação, cliente parado há
  // meses. Daí a sensação de que o sistema parou de indicar quem vai comprar.
  //
  // 1) Combinado velho nunca soltava: um "não agora, volta dia 6" de duas
  //    semanas atrás seguia calando o cliente mesmo depois de você falar com
  //    ele ontem. Vale o que ele disse por último.
  // 2) `>=` prendia quem estava marcado pra voltar HOJE: a fila natural tirava
  //    por ter data marcada, e o retorno só pegava data vencida. Quem pediu
  //    "me liga quinta" caía no vão justamente na quinta.
  const silenciados = new Set(
    (ultimos ?? [])
      .filter((u) =>
        silenciaHoje(
          {
            adiar_ate: u.adiar_ate,
            concluidoEm: u.concluido_em,
            criado_em: String(u.criado_em),
            combinado: u.combinado_com_cliente ?? false,
            tentativas: u.tentativas ?? 0,
          },
          hoje
        )
      )
      .map((u) => u.cliente_id)
  );
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
  const ultimoCombinado = new Map<
    string,
    {
      resultado: string;
      adiar_ate: string;
      observacao: string | null;
      criado_em: string;
      combinadoEm: string;
      /** Null = ninguém informou desfecho. Não é pendência. */
      concluidoEm: string | null;
      combinado: boolean;
      tentativas: number;
    }
  >();
  for (const c of ultimos ?? []) {
    // A view já entrega só o contato mais recente de cada cliente. Combinado
    // antigo não ressuscita.
    if (c.cliente_id && c.adiar_ate) {
      ultimoCombinado.set(c.cliente_id, {
        resultado: c.resultado ?? "",
        adiar_ate: String(c.adiar_ate),
        observacao: c.observacao,
        criado_em: String(c.criado_em),
        // Quando o combinado foi de fato firmado. Num contato corrigido, é a
        // data da correção — foi aí que o cliente disse o que disse.
        combinadoEm: String(c.atualizado_em ?? c.criado_em),
        concluidoEm: c.concluido_em,
        combinado: c.combinado_com_cliente ?? false,
        tentativas: c.tentativas ?? 0,
      });
    }
  }

  // `<= hoje`, não `< hoje`.
  //
  // Combinado marcado PRA HOJE caía num vão: `silenciados` tira da fila natural
  // quem tem adiar_ate >= hoje, e o retorno só pegava adiar_ate < hoje. O
  // cliente que pediu "me liga quinta" não aparecia na quinta em lugar nenhum —
  // só na sexta, e no rodapé "fora da lista" dizendo "volta em quinta". Toda
  // promessa nascia um dia atrasada.
  const idsRetorno = Array.from(ultimoCombinado.entries())
    // Contato de hoje só não volta hoje enquanto ninguém o concluiu.
    //
    // A regra nasceu contra o retorno automático: registrar contato agenda a
    // volta sozinho, e um vencimento no mesmo dia trazia de volta quem você
    // acabou de falar, com o selo "✓ falado hoje" pedindo pra ligar de novo.
    //
    // Mas quando VOCÊ conclui e marca o retorno pra hoje — "ele pediu pra
    // ligar de tarde" — é decisão sua, e o cliente precisa aparecer. Sem essa
    // diferença ele sumia das duas pontas: fora da bandeja por estar
    // concluído, fora da lista por ser de hoje.
    .filter(([, v]) => viraRetornoHoje(v, hoje))
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
      //
      // Compara com a data do COMBINADO, não com a do primeiro toque. Num
      // contato corrigido as duas divergem, e usar a antiga descartava promessa
      // nova: cliente que comprou pouco na terça e prometeu um pedido grande na
      // quinta sumia da lista, porque a compra de terça é posterior ao contato
      // de segunda.
      const compradoDepois =
        c.ultima_compra && String(c.ultima_compra) >= comb.combinadoEm.slice(0, 10);
      if (compradoDepois || jaEscolhido.has(c.id)) continue;
      retornos.push(
        monta(c as Bruto, "retorno", {
          resultado: comb.resultado,
          adiarAte: comb.adiar_ate,
          observacao: comb.observacao,
          tentativas: comb.tentativas,
        })
      );
    }
    // Mais atrasado primeiro: a promessa mais velha é a que mais corrói.
    retornos.sort((a, b) => (a.combinado!.adiarAte < b.combinado!.adiarAte ? -1 : 1));
  }

  const jaEmRetorno = new Set(retornos.map((c) => c.id));

  // 1b) Acompanhamento: você falou, o pedido não veio, o prazo da escada
  //     venceu. Antes isto aparecia como "retorno combinado" — 68 dos 107
  //     combinados vencidos num dia eram exatamente isto, passando na frente
  //     de quem estava vencendo o ciclo de compra. Mesmo cliente, nome certo,
  //     e com a contagem de tentativas à vista pra decidir se vale insistir.
  const idsAcomp = Array.from(ultimoCombinado.entries())
    .filter(([id, v]) => viraAcompanhamentoHoje(v, hoje) && !jaEmRetorno.has(id))
    .map(([id]) => id);

  const acompanhamentos: ClienteDoPlano[] = [];
  if (idsAcomp.length > 0) {
    const { data: clientesAcomp } = await supabase
      .from("vendas_clientes")
      .select(CAMPOS)
      .in("id", idsAcomp)
      .eq("ativo", true);

    for (const c of clientesAcomp ?? []) {
      const u = ultimoCombinado.get(c.id)!;
      // Comprou depois de você falar: deu certo. Quem decide isso é a venda,
      // não alguém lembrar de marcar — era este o passo que não acontecia.
      const compradoDepois =
        c.ultima_compra && String(c.ultima_compra) >= u.combinadoEm.slice(0, 10);
      if (compradoDepois || jaEscolhido.has(c.id)) continue;
      acompanhamentos.push(
        monta(c as Bruto, "acompanhamento", {
          resultado: u.resultado,
          adiarAte: u.adiar_ate,
          observacao: u.observacao,
          tentativas: u.tentativas,
        })
      );
    }
    // Quem foi tentado menos vezes primeiro: ainda tem mais chance de fechar.
    acompanhamentos.sort((a, b) => (a.combinado?.tentativas ?? 0) - (b.combinado?.tentativas ?? 0));
  }
  const jaEmAcomp = new Set(acompanhamentos.map((c) => c.id));

  // 2) Agenda: clientes com dia marcado pelo vendedor.
  //
  // "A banca da Plínio eu falo segunda, terça e quinta." Esse combinado existia
  // só na cabeça de quem atende; o sistema decidia pelo ciclo de compra e
  // mostrava o cliente em qualquer dia menos nos que importavam.
  //
  // Quem tem agenda sai do ciclo: aparece nos dias dela e não aparece nos
  // outros — senão marcar os dias não muda nada. O que passa por cima é
  // promessa (retorno combinado) e o silêncio de quem acabou de responder:
  // ninguém liga na terça pra quem disse "não agora" na segunda.
  const agendados = (comAgenda ?? [])
    .filter(
      (c) =>
        hojeEhDiaDeContato(c.dias_contato, hoje) &&
        !silenciados.has(c.id) &&
        !jaEmRetorno.has(c.id) &&
        !jaEmAcomp.has(c.id) &&
        !jaEscolhido.has(c.id)
    )
    .sort((a, b) => Number(b.ticket_medio ?? 0) - Number(a.ticket_medio ?? 0))
    .map((c) => monta(c as Bruto, "agenda"));

  // 3) Fila natural: o ciclo de compra decide. Sem quem combinou de voltar
  //    depois, sem repetir retorno e sem quem tem agenda própria.
  const disponiveis = (fila ?? []).filter(
    (c) =>
      !temAgenda(c.dias_contato) &&
      !silenciados.has(c.id) &&
      !jaEmRetorno.has(c.id) &&
      !jaEmAcomp.has(c.id) &&
      !jaEscolhido.has(c.id)
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

  // Ordem: o que foi prometido, o que o ciclo pede, e por último quem ainda
  // não respondeu. Acompanhamento depois do ciclo de propósito — quem está na
  // hora de comprar vale mais que quem já foi cobrado e não comprou.
  const base = [
    ...escolhidos,
    ...retornos,
    ...agendados,
    ...vencidos,
    ...previstos,
    ...acompanhamentos,
    ...novos,
  ];

  // 4) Cota de reativação: completa até o alvo, do maior valor em risco pro
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
    .filter(
      (c) =>
        !jaNaLista.has(c.id) &&
        !silenciados.has(c.id) &&
        !jaEscolhido.has(c.id) &&
        // Quem tem dia marcado não volta pela porta dos fundos numa terça.
        !temAgenda(c.dias_contato)
    )
    .slice(0, faltam)
    .map((c) => monta(c as Bruto, "reativacao"));

  // Rede de segurança: quem você falou hoje não some da tela hoje.
  //
  // As faixas acima olham o estado DEPOIS do contato, e aí um cliente que só
  // estava na lista por acompanhamento ou por retorno desaparece no instante
  // em que você fala com ele — some o cartão, não sobe o placar, e o clique
  // parece não ter funcionado. Esta faixa recolhe quem ficou de fora e o
  // mantém à vista até amanhã, apagado e com o selo.
  //
  // Vem no fim de propósito: já está resolvido, não disputa o topo da lista.
  const naListaAgora = new Set([...base, ...reativacao].map((c) => c.id));
  const faltamFalados = Array.from(trabalhadosHoje).filter(
    (id): id is string => !!id && !naListaAgora.has(id)
  );

  const faladosHoje: ClienteDoPlano[] = [];
  if (faltamFalados.length > 0) {
    const { data: cls } = await supabase
      .from("vendas_clientes")
      .select(CAMPOS)
      .in("id", faltamFalados)
      .eq("ativo", true);
    for (const c of cls ?? []) {
      const u = ultimoCombinado.get(c.id);
      faladosHoje.push(
        monta(c as Bruto, "falado_hoje", u
          ? {
              resultado: u.resultado,
              adiarAte: u.adiar_ate,
              observacao: u.observacao,
              tentativas: u.tentativas,
            }
          : null)
      );
    }
  }

  const lista = [...base, ...reativacao, ...faladosHoje];

  return {
    lista,
    // Conta quem foi falado hoje, não quem sobrou na lista. Registrar contato
    // agenda o retorno e tira o cliente da lista — contando pela lista, o
    // placar ficava em "0 de 55" mesmo depois de um dia inteiro de trabalho.
    trabalhados: trabalhadosHoje.size,
    totalReativacao: totalReativacao ?? 0,
  };
}
