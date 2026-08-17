"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_ESCRITA } from "../guard";
import {
  normalizar,
  normalizarLinhas,
  type LinhaBruta,
  type Mapeamento,
  type PedidoNormalizado,
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
    clientesNovos: string[];
    clientesReconhecidos: number;
    linhasRejeitadas: { linha: number; motivo: string }[];
    itensNovos: number;
    periodo: { inicio: string; fim: string } | null;
    valorTotal: number;
    amostra: { pedido: string; data: string; cliente: string; total: number; novo: boolean }[];
  };
  gravado?: {
    pedidosNovos: number;
    clientesNovos: number;
    itensNovos: number;
    importacaoId: string;
  };
};

/** Busca em lotes: `in()` com lista gigante estoura a URL do PostgREST. */
async function pedidosExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  numeros: string[]
): Promise<Set<string>> {
  const achados = new Set<string>();
  for (let i = 0; i < numeros.length; i += LOTE) {
    const fatia = numeros.slice(i, i + LOTE);
    const { data } = await supabase.from("vendas_pedidos").select("pedido").in("pedido", fatia);
    for (const r of data ?? []) achados.add(String(r.pedido));
  }
  return achados;
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
  linhas: LinhaBruta[],
  mapeamento: Mapeamento
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
  if (linhas.length > MAX_LINHAS) {
    return { error: `Arquivo com ${linhas.length} linhas. O limite é ${MAX_LINHAS}.` };
  }

  const { pedidos, rejeitadas } = normalizarLinhas(linhas, mapeamento);
  if (pedidos.length === 0) {
    return {
      error:
        rejeitadas.length > 0
          ? `Nenhuma linha aproveitável. Primeiro problema: linha ${rejeitadas[0].linha} — ${rejeitadas[0].motivo}. Confira o de-para das colunas.`
          : "Nenhum pedido encontrado no arquivo.",
    };
  }

  const existentes = await pedidosExistentes(supabase, pedidos.map((p) => p.pedido));
  const idx = await montarIndiceClientes(supabase);

  const novos = pedidos.filter((p) => !existentes.has(p.pedido));
  const nomesNovos = new Set<string>();
  let reconhecidos = 0;
  for (const p of pedidos) {
    if (acharCliente(p, idx)) reconhecidos++;
    else nomesNovos.add(p.clienteNome);
  }

  const datas = pedidos.map((p) => p.data).sort();

  return {
    previa: {
      pedidosNoArquivo: pedidos.length,
      pedidosNovos: novos.length,
      pedidosJaExistiam: pedidos.length - novos.length,
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
    },
  };
}

export async function gravarImportacaoAction(
  linhas: LinhaBruta[],
  mapeamento: Mapeamento,
  arquivoNome: string
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
  if (linhas.length > MAX_LINHAS) {
    return { error: `Arquivo com ${linhas.length} linhas. O limite é ${MAX_LINHAS}.` };
  }

  const { pedidos, rejeitadas } = normalizarLinhas(linhas, mapeamento);
  if (pedidos.length === 0) return { error: "Nenhum pedido aproveitável no arquivo." };

  const existentes = await pedidosExistentes(supabase, pedidos.map((p) => p.pedido));
  const novos = pedidos.filter((p) => !existentes.has(p.pedido));
  if (novos.length === 0) {
    return { error: "Todos os pedidos do arquivo já estavam no sistema. Nada a importar." };
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
  const datas = novos.map((p) => p.data).sort();
  const { data: imp, error: impErr } = await supabase
    .from("vendas_importacoes")
    .insert({
      arquivo_nome: arquivoNome,
      importado_por: profile?.nome ?? user.email ?? null,
      periodo_inicio: datas[0],
      periodo_fim: datas[datas.length - 1],
      pedidos_novos: novos.length,
      pedidos_ignorados: pedidos.length - novos.length,
      clientes_novos: clientesNovos,
      cadastros_a_verificar: clientesNovos,
      avisos: rejeitadas.slice(0, 200),
    })
    .select("id")
    .single();
  if (impErr) return { error: `Erro registrando a importação: ${impErr.message}` };

  // 3) Pedidos em lote. Depois do passo 1 todo cliente existe; se algum escapou,
  //    para aqui em vez de deixar o banco recusar com erro cru de NOT NULL.
  const linhasPedido: {
    pedido: string;
    cliente_id: string;
    data: string;
    total: number;
    forma_pag: string | null;
    eh_valido: boolean;
    importacao_id: string;
  }[] = [];
  for (const p of novos) {
    const cliente_id = acharCliente(p, idx);
    if (!cliente_id) {
      return {
        error: `Pedido ${p.pedido}: não consegui vincular o cliente “${p.clienteNome}”. Nenhum pedido foi gravado — reveja a coluna de cliente no de-para.`,
      };
    }
    linhasPedido.push({
      pedido: p.pedido,
      cliente_id,
      data: p.data,
      total: p.total,
      forma_pag: p.formaPag,
      eh_valido: true,
      importacao_id: imp!.id,
    });
  }
  for (let i = 0; i < linhasPedido.length; i += LOTE) {
    const { error } = await supabase
      .from("vendas_pedidos")
      .insert(linhasPedido.slice(i, i + LOTE));
    if (error) return { error: `Erro gravando pedidos: ${error.message}` };
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
    if (error) return { error: `Pedidos gravados, mas falhou nos itens: ${error.message}` };
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
      clientesNovos,
      itensNovos: linhasItem.length,
      importacaoId: imp!.id,
    },
  };
}
