"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_ESCRITA } from "../guard";
import {
  coberturaPorDia,
  diasFaltando,
  normalizar,
  type PedidoNormalizado,
  type Rejeitada,
} from "./lib";

// Teto pra não estourar memória nem o payload da server action.
const MAX_LINHAS = 20000;
const LOTE = 400;

export type ResultadoImport = {
  error?: string;
  previa?: {
    pedidosNoArquivo: number;
    pedidosNovos: number;
    pedidosJaExistiam: number;
    /** Já existiam, mas com valor/data/atendente diferentes do arquivo. */
    pedidosAlterados: { pedido: string; de: string; para: string }[];
    clientesNovos: string[];
    clientesReconhecidos: number;
    linhasRejeitadas: { linha: number; motivo: string }[];
    itensNovos: number;
    periodo: { inicio: string; fim: string } | null;
    valorTotal: number;
    amostra: { pedido: string; data: string; cliente: string; total: number; novo: boolean }[];
    /** Pedidos e valor por dia — pra ver de bate-pronto se algum dia veio torto. */
    cobertura: { data: string; pedidos: number; valor: number }[];
    /** Dias úteis entre a última venda registrada e o início do arquivo. */
    diasFaltando: string[];
    ultimaNoSistema: string | null;
    porAtendente: { atendente: string; pedidos: number; valor: number }[];
  };
  gravado?: {
    pedidosNovos: number;
    pedidosAtualizados: number;
    clientesNovos: number;
    itensNovos: number;
    importacaoId: string;
  };
};

/** Busca em lotes: `in()` com lista gigante estoura a URL do PostgREST. */
type PedidoGravado = {
  pedido: string;
  data: string;
  total: number;
  forma_pag: string | null;
  atendente: string | null;
};

/**
 * O que já está gravado, com os campos — e não só o número.
 *
 * Importar antes do dia fechar é o uso normal: o vendedor precisa enxergar o
 * pedido de amanhã pra não ligar cobrando quem já pediu. Só que pedido em
 * aberto ainda muda de valor. Por isso a importação compara e corrige, em vez
 * de ignorar o que já existe.
 */
async function pedidosExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  numeros: string[]
): Promise<Map<string, PedidoGravado>> {
  const achados = new Map<string, PedidoGravado>();
  for (let i = 0; i < numeros.length; i += LOTE) {
    const fatia = numeros.slice(i, i + LOTE);
    const { data } = await supabase
      .from("vendas_pedidos")
      .select("pedido, data, total, forma_pag, atendente")
      .in("pedido", fatia);
    for (const r of data ?? []) {
      achados.set(String(r.pedido), {
        pedido: String(r.pedido),
        data: String(r.data),
        total: Number(r.total),
        forma_pag: r.forma_pag,
        atendente: r.atendente,
      });
    }
  }
  return achados;
}

/** Centavos batem? Comparação de dinheiro nunca por igualdade de float. */
const mesmoValor = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

/** O que mudou entre o gravado e o arquivo. Vazio = nada a fazer. */
function diferencas(velho: PedidoGravado, novo: PedidoNormalizado): string[] {
  const d: string[] = [];
  if (!mesmoValor(velho.total, novo.total)) {
    d.push(`R$ ${velho.total.toFixed(2)} → R$ ${novo.total.toFixed(2)}`);
  }
  if (velho.data !== novo.data) d.push(`data ${velho.data} → ${novo.data}`);
  if ((velho.forma_pag ?? "") !== (novo.formaPag ?? "")) {
    d.push(`pagto ${velho.forma_pag ?? "—"} → ${novo.formaPag ?? "—"}`);
  }
  if ((velho.atendente ?? "") !== (novo.atendente ?? "")) {
    d.push(`atendente ${velho.atendente ?? "—"} → ${novo.atendente ?? "—"}`);
  }
  return d;
}

/**
 * Casa o cliente do arquivo com a carteira. Prioriza o código (chave estável do
 * ERP); só cai no nome quando não houver código, porque nome muda de grafia.
 */
async function montarIndiceClientes(supabase: Awaited<ReturnType<typeof createClient>>) {
  const porCodigo = new Map<string, string>();
  const porNome = new Map<string, string>();

  const { data: clientes } = await supabase
    .from("vendas_clientes")
    .select("id, nome, codigo_cliente")
    .limit(5000);
  for (const c of clientes ?? []) {
    if (c.codigo_cliente) porCodigo.set(normalizar(c.codigo_cliente), c.id);
    porNome.set(normalizar(c.nome), c.id);
  }

  // Apelidos: o mesmo cliente já apareceu no ERP com outras grafias.
  const { data: apelidos } = await supabase
    .from("vendas_cliente_apelidos")
    .select("cliente_id, cadastro_original")
    .limit(5000);
  for (const a of apelidos ?? []) {
    if (a.cadastro_original && a.cliente_id) {
      const k = normalizar(a.cadastro_original);
      if (!porNome.has(k)) porNome.set(k, a.cliente_id);
    }
  }

  return { porCodigo, porNome };
}

function acharCliente(
  p: PedidoNormalizado,
  idx: { porCodigo: Map<string, string>; porNome: Map<string, string> }
): string | null {
  if (p.codigoCliente) {
    const porCod = idx.porCodigo.get(normalizar(p.codigoCliente));
    if (porCod) return porCod;
  }
  return idx.porNome.get(normalizar(p.clienteNome)) ?? null;
}

export async function analisarImportacaoAction(
  pedidos: PedidoNormalizado[],
  rejeitadas: Rejeitada[] = []
): Promise<ResultadoImport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!(PAPEIS_ESCRITA as readonly string[]).includes(profile?.role ?? "")) {
    return { error: "Só admin ou vendas podem importar." };
  }
  if (pedidos.length > MAX_LINHAS) {
    return { error: `Arquivo com ${pedidos.length} pedidos. O limite é ${MAX_LINHAS}.` };
  }
  if (pedidos.length === 0) {
    return {
      error:
        rejeitadas.length > 0
          ? `Nenhuma linha aproveitável. Primeiro problema: linha ${rejeitadas[0].linha} — ${rejeitadas[0].motivo}.`
          : "Nenhum pedido encontrado no arquivo.",
    };
  }

  const [existentes, idx, { data: ultimo }] = await Promise.all([
    pedidosExistentes(supabase, pedidos.map((p) => p.pedido)),
    montarIndiceClientes(supabase),
    supabase
      .from("vendas_pedidos")
      .select("data")
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const novos = pedidos.filter((p) => !existentes.has(p.pedido));
  const nomesNovos = new Set<string>();
  let reconhecidos = 0;
  for (const p of pedidos) {
    if (acharCliente(p, idx)) reconhecidos++;
    else nomesNovos.add(p.clienteNome);
  }

  const datas = pedidos.map((p) => p.data).sort();
  const ultimaNoSistema = ultimo?.data ?? null;

  // O que já existe mas veio diferente. Mostrar antes de gravar é o que
  // permite desconfiar de um arquivo errado em vez de sobrescrever no escuro.
  const pedidosAlterados: { pedido: string; de: string; para: string }[] = [];
  for (const p of pedidos) {
    const velho = existentes.get(p.pedido);
    if (!velho) continue;
    const d = diferencas(velho, p);
    if (d.length > 0) {
      pedidosAlterados.push({ pedido: p.pedido, de: d.join(" · "), para: "" });
    }
  }

  // Quanto cada atendente vendeu neste arquivo — só o que conta como venda.
  const atend = new Map<string, { pedidos: number; valor: number }>();
  for (const p of novos) {
    if (!p.atendente || p.total <= 0) continue;
    const a = atend.get(p.atendente) ?? { pedidos: 0, valor: 0 };
    a.pedidos++;
    a.valor += p.total;
    atend.set(p.atendente, a);
  }

  return {
    previa: {
      pedidosNoArquivo: pedidos.length,
      pedidosNovos: novos.length,
      pedidosJaExistiam: pedidos.length - novos.length,
      pedidosAlterados,
      clientesNovos: Array.from(nomesNovos).sort(),
      clientesReconhecidos: reconhecidos,
      linhasRejeitadas: rejeitadas.slice(0, 50),
      itensNovos: novos.reduce((s, p) => s + p.itens.length, 0),
      periodo: datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
      valorTotal: novos.reduce((s, p) => s + p.total, 0),
      amostra: pedidos.slice(0, 8).map((p) => ({
        pedido: p.pedido,
        data: p.data,
        cliente: p.clienteNome,
        total: p.total,
        novo: !existentes.has(p.pedido),
      })),
      cobertura: coberturaPorDia(pedidos),
      diasFaltando: datas.length ? diasFaltando(ultimaNoSistema, datas[0]) : [],
      ultimaNoSistema,
      porAtendente: Array.from(atend.entries())
        .map(([atendente, d]) => ({ atendente, ...d }))
        .sort((a, b) => b.valor - a.valor),
    },
  };
}

export async function gravarImportacaoAction(
  pedidos: PedidoNormalizado[],
  arquivoNome: string,
  rejeitadas: Rejeitada[] = []
): Promise<ResultadoImport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, nome")
    .eq("id", user.id)
    .maybeSingle();
  if (!(PAPEIS_ESCRITA as readonly string[]).includes(profile?.role ?? "")) {
    return { error: "Só admin ou vendas podem importar." };
  }
  if (pedidos.length > MAX_LINHAS) {
    return { error: `Arquivo com ${pedidos.length} pedidos. O limite é ${MAX_LINHAS}.` };
  }
  if (pedidos.length === 0) return { error: "Nenhum pedido aproveitável no arquivo." };

  const existentes = await pedidosExistentes(supabase, pedidos.map((p) => p.pedido));
  const novos = pedidos.filter((p) => !existentes.has(p.pedido));

  // Pedido em aberto muda de valor até fechar. Reimportar o mesmo dia corrige
  // o que mudou em vez de deixar congelado o número da primeira leitura.
  const aAtualizar = pedidos.filter((p) => {
    const velho = existentes.get(p.pedido);
    return velho && diferencas(velho, p).length > 0;
  });

  if (novos.length === 0 && aAtualizar.length === 0) {
    return { error: "Todos os pedidos do arquivo já estavam no sistema, sem nenhuma alteração." };
  }

  const idx = await montarIndiceClientes(supabase);

  // 1) Clientes que não existem ainda. Nascem marcados pra conferência —
  //    telefone e endereço só o cadastro do ERP tem.
  const semCliente = new Map<string, PedidoNormalizado>();
  for (const p of novos) {
    if (!acharCliente(p, idx)) semCliente.set(normalizar(p.clienteNome), p);
  }

  // codigo_cliente é NOT NULL e único. Quando o arquivo não traz código,
  // geramos um IMP-nnn continuando de onde a última importação parou.
  let proximoImp = 1;
  if (semCliente.size > 0) {
    const { data: usados } = await supabase
      .from("vendas_clientes")
      .select("codigo_cliente")
      .like("codigo_cliente", "IMP-%");
    for (const u of usados ?? []) {
      const n = Number(String(u.codigo_cliente).replace("IMP-", ""));
      if (Number.isFinite(n) && n >= proximoImp) proximoImp = n + 1;
    }
  }

  let clientesNovos = 0;
  for (const p of semCliente.values()) {
    const codigo = p.codigoCliente || `IMP-${String(proximoImp++).padStart(4, "0")}`;
    const { data, error } = await supabase
      .from("vendas_clientes")
      .insert({
        nome: p.clienteNome,
        codigo_cliente: codigo,
        ativo: true,
        verificar: true,
        motivo_verificar: "cadastro criado pela importação — falta telefone/endereço",
      })
      .select("id")
      .single();
    if (error) {
      return {
        error:
          error.code === "23505"
            ? `O código “${codigo}” do cliente “${p.clienteNome}” já existe com outro nome. Confira a coluna de código do cliente no de-para.`
            : `Erro criando cliente “${p.clienteNome}”: ${error.message}`,
      };
    }
    idx.porNome.set(normalizar(p.clienteNome), data!.id);
    idx.porCodigo.set(normalizar(codigo), data!.id);
    clientesNovos++;
  }

  // 2) Registro da importação — vem antes pra cada pedido já nascer vinculado.
  const datas = (novos.length > 0 ? novos : aAtualizar).map((p) => p.data).sort();
  const { data: imp, error: impErr } = await supabase
    .from("vendas_importacoes")
    .insert({
      arquivo_nome: arquivoNome,
      importado_por: profile?.nome ?? user.email ?? null,
      periodo_inicio: datas[0],
      periodo_fim: datas[datas.length - 1],
      pedidos_novos: novos.length,
      pedidos_ignorados: pedidos.length - novos.length - aAtualizar.length,
      clientes_novos: clientesNovos,
      cadastros_a_verificar: clientesNovos,
      avisos: rejeitadas.slice(0, 200),
    })
    .select("id")
    .single();
  if (impErr) return { error: `Erro registrando a importação: ${impErr.message}` };

  /**
   * O registro da importação precisa existir antes dos pedidos (eles guardam
   * importacao_id). Se a gravação falhar depois disso, o registro fica mentindo
   * que importou N pedidos — foi o que aconteceu na falha do eh_valido.
   * Toda saída de erro daqui pra baixo passa por aqui e desfaz o registro.
   */
  const abortar = async (msg: string): Promise<ResultadoImport> => {
    await supabase.from("vendas_importacoes").delete().eq("id", imp!.id);
    return { error: msg };
  };

  // 3) Pedidos em lote. Depois do passo 1 todo cliente existe; se algum escapou,
  //    para aqui em vez de deixar o banco recusar com erro cru de NOT NULL.
  // eh_valido NÃO entra aqui: é coluna GERADA
  // (forma_pag <> 'Cortesia' AND total > 0). O banco marca sozinho que
  // cortesia e pedido de valor zero não contam pras métricas.
  const linhasPedido: {
    pedido: string;
    cliente_id: string;
    data: string;
    total: number;
    forma_pag: string | null;
    atendente: string | null;
    importacao_id: string;
  }[] = [];
  for (const p of novos) {
    const cliente_id = acharCliente(p, idx);
    if (!cliente_id) {
      return abortar(
        `Pedido ${p.pedido}: não consegui vincular o cliente “${p.clienteNome}”. Nenhum pedido foi gravado.`
      );
    }
    linhasPedido.push({
      pedido: p.pedido,
      cliente_id,
      data: p.data,
      total: p.total,
      forma_pag: p.formaPag,
      atendente: p.atendente,
      importacao_id: imp!.id,
    });
  }
  for (let i = 0; i < linhasPedido.length; i += LOTE) {
    const { error } = await supabase
      .from("vendas_pedidos")
      .insert(linhasPedido.slice(i, i + LOTE));
    if (error) return abortar(`Erro gravando pedidos: ${error.message}`);
  }

  // 3b) Corrige os que já existiam e vieram diferentes. Um a um de propósito:
  //     upsert em lote sobrescreveria importacao_id e apagaria de qual
  //     importação o pedido veio originalmente.
  let atualizados = 0;
  for (const p of aAtualizar) {
    const cliente_id = acharCliente(p, idx);
    const { error } = await supabase
      .from("vendas_pedidos")
      .update({
        data: p.data,
        total: p.total,
        forma_pag: p.formaPag,
        atendente: p.atendente,
        ...(cliente_id ? { cliente_id } : {}),
      })
      .eq("pedido", p.pedido);
    if (error) return abortar(`Erro atualizando o pedido ${p.pedido}: ${error.message}`);

    // Os itens do pedido são regravados: se o valor mudou, a composição mudou
    // junto, e item velho sobrando estragaria o "costuma levar".
    if (p.itens.length > 0) {
      await supabase.from("vendas_itens").delete().eq("pedido", p.pedido);
      const itens = p.itens.map((it) => ({
        pedido: p.pedido,
        produto: it.produto,
        qtd: it.qtd,
        valor: it.valor,
        eh_produto: !/^(taxa|desconto|extra)/i.test(it.produto.trim()),
      }));
      const { error: iErr } = await supabase.from("vendas_itens").insert(itens);
      if (iErr) return abortar(`Erro regravando itens do pedido ${p.pedido}: ${iErr.message}`);
    }
    atualizados++;
  }

  // 4) Itens, quando o arquivo trouxer. eh_produto separa produto de taxa e
  //    desconto — é o que a métrica de "costuma levar" usa.
  const linhasItem = novos.flatMap((p) =>
    p.itens.map((it) => ({
      pedido: p.pedido,
      produto: it.produto,
      qtd: it.qtd,
      valor: it.valor,
      eh_produto: !/^(taxa|desconto|extra)/i.test(it.produto.trim()),
    }))
  );
  for (let i = 0; i < linhasItem.length; i += LOTE) {
    const { error } = await supabase.from("vendas_itens").insert(linhasItem.slice(i, i + LOTE));
    if (error) {
      // Aqui NÃO desfaz: os pedidos já entraram e são a parte que importa.
      // Reimportar o mesmo arquivo completa os itens sem duplicar pedido.
      return { error: `Pedidos gravados, mas falhou nos itens: ${error.message}. Rode a importação de novo — os pedidos repetidos são ignorados.` };
    }
  }

  // 5) Recalcula a carteira. Sem isso os pedidos entram e nada muda na tela.
  const { error: e1 } = await supabase.rpc("recalcular_metricas_vendas");
  const { error: e2 } = await supabase.rpc("recalcular_itens_habituais");
  if (e1 || e2) {
    return {
      error: `Importação gravada, mas o recálculo das métricas falhou: ${
        e1?.message ?? e2?.message
      }. Os pedidos estão no sistema; rode a importação de novo (ela ignora repetidos) ou chame o suporte.`,
    };
  }

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  revalidatePath("/vendas/relatorio-semanal");

  return {
    gravado: {
      pedidosNovos: novos.length,
      pedidosAtualizados: atualizados,
      clientesNovos,
      itensNovos: linhasItem.length,
      importacaoId: imp!.id,
    },
  };
}
