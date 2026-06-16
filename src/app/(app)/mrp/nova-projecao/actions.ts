"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function assertAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || !["aprovador", "comprador"].includes(profile.role)) {
    return { ok: false as const, error: "Sem permissão." };
  }
  return { ok: true as const, userId: user.id };
}

export type DemandaInput = {
  produto_id: string;
  quantidade: number;
  observacoes?: string | null;
};

/**
 * Cria a projeção + grava a demanda lançada. Retorna o id pra navegar.
 */
export async function criarProjecaoAction(
  semanaInicio: string,
  semanaFim: string,
  demanda: DemandaInput[]
): Promise<{ error?: string; projecaoId?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaInicio)) return { error: "Data inicial inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaFim)) return { error: "Data final inválida." };
  if (semanaFim < semanaInicio) return { error: "Data final antes da inicial." };
  if (demanda.length === 0) return { error: "Lance pelo menos um produto na demanda." };
  for (const d of demanda) {
    if (!d.produto_id) return { error: "Produto sem id." };
    if (d.quantidade <= 0) return { error: "Quantidade precisa ser maior que zero." };
  }

  const supabase = await createClient();

  // Pega a última contagem finalizada (vira o snapshot de estoque)
  const { data: contagem } = await supabase
    .from("contagens")
    .select("id")
    .eq("finalizada", true)
    .order("data_contagem", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cria a projeção
  const { data: projecao, error: insErr } = await supabase
    .from("projecao_producao")
    .insert({
      semana_inicio: semanaInicio,
      semana_fim: semanaFim,
      contagem_id: contagem?.id ?? null,
      status: "rascunho",
      criado_por: guard.userId,
    })
    .select("id")
    .single();
  if (insErr || !projecao) return { error: insErr?.message ?? "Falha ao criar projeção." };

  // Insere demanda
  const payload = demanda.map((d) => ({
    projecao_id: projecao.id,
    produto_id: d.produto_id,
    quantidade: d.quantidade,
    observacoes: d.observacoes?.trim() || null,
  }));
  const { error: demErr } = await supabase.from("projecao_demanda").insert(payload);
  if (demErr) {
    await supabase.from("projecao_producao").delete().eq("id", projecao.id);
    return { error: demErr.message };
  }

  revalidatePath("/mrp/projecoes");
  redirect(`/mrp/nova-projecao/${projecao.id}`);
}

/**
 * Roda o cálculo da projeção:
 * - Para cada produto demandado, expande recursivamente sua ficha técnica
 *   (BOM multi-nível) até chegar em ITENS de compra.
 * - Aplica merma % em cada nível.
 * - Agrega necessidade bruta por item.
 * - Subtrai estoque atual (última contagem) → necessidade líquida.
 * - Salva em projecao_necessidade.
 */
export async function calcularProjecaoAction(
  projecaoId: string
): Promise<{ error?: string; alertas?: string[] }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();
  const alertas: string[] = [];

  // 1) Busca projeção + demanda
  const { data: projecao } = await supabase
    .from("projecao_producao")
    .select("id, contagem_id, status")
    .eq("id", projecaoId)
    .maybeSingle();
  if (!projecao) return { error: "Projeção não encontrada." };

  const { data: demanda } = await supabase
    .from("projecao_demanda")
    .select("produto_id, quantidade")
    .eq("projecao_id", projecaoId);
  if (!demanda || demanda.length === 0) return { error: "Demanda vazia." };

  // 2) Cache de fichas técnicas vigentes (uma query, depois lookup)
  // Pega TODAS as fichas vigentes + seus itens em uma só query
  const { data: fichas } = await supabase
    .from("ficha_tecnica")
    .select(
      `
      id, produto_id,
      itens:ficha_item(item_id, produto_referenciado_id, quantidade, merma_percent)
    `
    )
    .eq("vigente", true);

  const fichaPorProduto = new Map<string, Array<{
    item_id: string | null;
    produto_referenciado_id: string | null;
    quantidade: number;
    merma_percent: number;
  }>>();
  for (const f of fichas ?? []) {
    fichaPorProduto.set(
      f.produto_id,
      (f.itens ?? []).map((i) => ({
        item_id: i.item_id,
        produto_referenciado_id: i.produto_referenciado_id,
        quantidade: Number(i.quantidade),
        merma_percent: Number(i.merma_percent),
      }))
    );
  }

  // 3) Expansão recursiva (BOM multi-nível)
  const necessidade = new Map<string, number>(); // item_id → qtd total
  const produtosSemFicha = new Set<string>();
  const visitando = new Set<string>(); // detecção de loop infinito

  function expandir(produtoId: string, qtdProduto: number) {
    if (visitando.has(produtoId)) {
      alertas.push(`Loop detectado no produto ${produtoId} — abortado nesse ramo.`);
      return;
    }
    const ficha = fichaPorProduto.get(produtoId);
    if (!ficha || ficha.length === 0) {
      produtosSemFicha.add(produtoId);
      return;
    }
    visitando.add(produtoId);
    for (const linha of ficha) {
      // Quantidade consumida = qtd_produto * qtd_da_linha * (1 + merma%)
      const qtd = qtdProduto * linha.quantidade * (1 + linha.merma_percent / 100);
      if (linha.item_id) {
        necessidade.set(linha.item_id, (necessidade.get(linha.item_id) ?? 0) + qtd);
      } else if (linha.produto_referenciado_id) {
        expandir(linha.produto_referenciado_id, qtd);
      }
    }
    visitando.delete(produtoId);
  }

  for (const d of demanda) {
    expandir(d.produto_id, Number(d.quantidade));
  }

  if (produtosSemFicha.size > 0) {
    alertas.push(
      `${produtosSemFicha.size} produto(s) sem ficha técnica vigente — não foram expandidos.`
    );
  }

  // 4) Lê estoque da última contagem (se houver)
  const estoque = new Map<string, number>();
  if (projecao.contagem_id) {
    const { data: linhasContagem } = await supabase
      .from("contagem_linhas")
      .select("item_id, quantidade")
      .eq("contagem_id", projecao.contagem_id)
      .not("item_id", "is", null);
    for (const l of linhasContagem ?? []) {
      if (l.item_id && l.quantidade != null) {
        estoque.set(l.item_id, (estoque.get(l.item_id) ?? 0) + Number(l.quantidade));
      }
    }
  } else {
    alertas.push("Nenhuma contagem finalizada — estoque tratado como zero.");
  }

  // 5) Busca info dos itens necessários (unidade)
  const itensIds = Array.from(necessidade.keys());
  if (itensIds.length === 0) {
    return { error: "Cálculo não gerou necessidades. Veja se há fichas vigentes pros produtos." };
  }

  const { data: itensInfo } = await supabase
    .from("itens")
    .select("id, nome, codigo_queops, unidade:unidades_medida(nome)")
    .in("id", itensIds);
  const itemInfo = new Map(
    (itensInfo ?? []).map((i) => [i.id, { nome: i.nome, codigo: i.codigo_queops, unidade: i.unidade?.nome ?? "" }])
  );

  // 6) Apaga necessidade antiga e insere novo cálculo
  await supabase.from("projecao_necessidade").delete().eq("projecao_id", projecaoId);

  const payload = itensIds.map((itemId) => {
    const bruta = necessidade.get(itemId)!;
    const estoqueAtual = estoque.get(itemId) ?? 0;
    const liquida = Math.max(bruta - estoqueAtual, 0);
    const info = itemInfo.get(itemId);
    const itemAlertas: string[] = [];
    if (!estoque.has(itemId)) itemAlertas.push("sem contagem");
    if (!info?.codigo) itemAlertas.push("sem código Queóps");
    return {
      projecao_id: projecaoId,
      item_id: itemId,
      necessidade_bruta: bruta,
      estoque_atual: estoqueAtual,
      necessidade_liquida: liquida,
      quantidade_a_comprar: liquida,
      unidade: info?.unidade ?? "",
      alertas: itemAlertas,
    };
  });

  const { error: nErr } = await supabase.from("projecao_necessidade").insert(payload);
  if (nErr) return { error: nErr.message };

  // 7) Atualiza status
  await supabase
    .from("projecao_producao")
    .update({ status: "calculada", data_calculo: new Date().toISOString().slice(0, 10) })
    .eq("id", projecaoId);

  revalidatePath(`/mrp/nova-projecao/${projecaoId}`);
  return { alertas };
}

/**
 * Salva edição manual da qtd_a_comprar (usuário ajustou pra cima/baixo).
 */
export async function atualizarQtdAComprarAction(
  projecaoId: string,
  itemId: string,
  novaQtd: number
): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };
  if (novaQtd < 0) return { error: "Quantidade negativa." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projecao_necessidade")
    .update({ quantidade_a_comprar: novaQtd })
    .eq("projecao_id", projecaoId)
    .eq("item_id", itemId);
  if (error) return { error: error.message };
  revalidatePath(`/mrp/nova-projecao/${projecaoId}`);
  return {};
}

export async function excluirProjecaoAction(projecaoId: string): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("projecao_producao").delete().eq("id", projecaoId);
  if (error) return { error: error.message };
  revalidatePath("/mrp/projecoes");
  redirect("/mrp/projecoes");
}

/**
 * Materializa a projeção em uma SolicitacaoSemanal:
 * - Cria solicitacao_semanal com origem='MRP', projecao_id ligado
 * - Pra cada projecao_necessidade com quantidade_a_comprar > 0, cria
 *   solicitacao_linha com volume_solicitado, item_id, preço de referência etc
 * - Marca a projeção como convertida_em_solicitacao
 * - Redireciona pra /solicitacoes/[id] (fluxo normal de aprovação)
 */
export async function gerarSolicitacaoAction(
  projecaoId: string
): Promise<{ error?: string; solicitacaoId?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();

  // 1) Confere projeção
  const { data: projecao } = await supabase
    .from("projecao_producao")
    .select("id, semana_inicio, semana_fim, status, solicitacao_id")
    .eq("id", projecaoId)
    .maybeSingle();
  if (!projecao) return { error: "Projeção não encontrada." };
  if (projecao.status === "convertida_em_solicitacao" && projecao.solicitacao_id) {
    return { error: "Já existe solicitação gerada pra esta projeção.", solicitacaoId: projecao.solicitacao_id };
  }
  if (projecao.status !== "calculada") {
    return { error: "Projeção precisa estar com cálculo feito." };
  }

  // 2) Pega as necessidades com qtd_a_comprar > 0
  const { data: necessidades } = await supabase
    .from("projecao_necessidade")
    .select(
      `
      item_id, quantidade_a_comprar, estoque_atual,
      item:itens(
        codigo_queops, nome, preco_referencia,
        fornecedor_padrao_id, forma_pagto_padrao_id, prazo_padrao,
        classificacao:classificacoes(nome),
        unidade:unidades_medida(nome)
      )
    `
    )
    .eq("projecao_id", projecaoId)
    .gt("quantidade_a_comprar", 0);

  if (!necessidades || necessidades.length === 0) {
    return { error: "Nenhuma necessidade com quantidade a comprar > 0. Recalcule a projeção." };
  }

  // 3) Cria a SolicitacaoSemanal
  const { data: solicitacao, error: solErr } = await supabase
    .from("solicitacoes_semanais")
    .insert({
      data_inicio: projecao.semana_inicio,
      data_fim: projecao.semana_fim,
      comprador_id: guard.userId,
      observacoes: `Gerada pelo MRP a partir de projeção.`,
      finalizada: false,
      origem: "MRP",
      projecao_id: projecaoId,
    })
    .select("id")
    .single();
  if (solErr || !solicitacao) {
    return { error: solErr?.message ?? "Falha ao criar solicitação semanal." };
  }

  // 4) Cria as linhas
  const payload = necessidades.map((n) => {
    const preco = n.item?.preco_referencia ?? 0;
    return {
      solicitacao_id: solicitacao.id,
      item_id: n.item_id,
      // Snapshots (caso item mude depois, linha mantém a foto)
      codigo_queops_congelado: n.item?.codigo_queops ?? null,
      nome_item_congelado: n.item?.nome ?? null,
      classificacao_congelada: n.item?.classificacao?.nome ?? null,
      unidade_congelada: n.item?.unidade?.nome ?? null,
      // Dados pra fluxo
      volume_estoque: Number(n.estoque_atual),
      volume_solicitado: Number(n.quantidade_a_comprar),
      preco: Number(preco),
      fornecedor_id: n.item?.fornecedor_padrao_id ?? null,
      forma_pagto_id: n.item?.forma_pagto_padrao_id ?? null,
      prazo: n.item?.prazo_padrao ?? null,
      status: "Para Aprovar" as const,
    };
  });

  const { error: linhasErr } = await supabase.from("solicitacao_linhas").insert(payload);
  if (linhasErr) {
    // Rollback: apaga a solicitação criada
    await supabase.from("solicitacoes_semanais").delete().eq("id", solicitacao.id);
    return { error: `Falha ao criar linhas: ${linhasErr.message}` };
  }

  // 5) Atualiza projeção
  const { error: updErr } = await supabase
    .from("projecao_producao")
    .update({
      status: "convertida_em_solicitacao",
      solicitacao_id: solicitacao.id,
    })
    .eq("id", projecaoId);
  if (updErr) {
    return {
      error: `Solicitação criada mas falhou ao atualizar status da projeção: ${updErr.message}`,
      solicitacaoId: solicitacao.id,
    };
  }

  revalidatePath(`/mrp/nova-projecao/${projecaoId}`);
  revalidatePath("/mrp/projecoes");
  revalidatePath(`/solicitacoes/${solicitacao.id}`);
  revalidatePath("/solicitacoes");
  return { solicitacaoId: solicitacao.id };
}

