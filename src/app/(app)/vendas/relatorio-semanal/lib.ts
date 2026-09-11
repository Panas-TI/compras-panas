/**
 * Normalização do arquivo de vendas do ERP.
 *
 * Mesmas funções usadas na prévia e na gravação — se divergissem, a prévia
 * mentiria e o usuário confirmaria uma coisa achando que era outra.
 */

/** Campos que a importação sabe usar. Só os 4 primeiros são obrigatórios. */
export const CAMPOS_IMPORT = [
  { chave: "pedido", rotulo: "Nº do pedido", obrigatorio: true, dicas: ["pedido", "numero", "nº", "n°", "documento", "nota"] },
  { chave: "data", rotulo: "Data", obrigatorio: true, dicas: ["data", "emissao", "emissão", "dia"] },
  { chave: "cliente", rotulo: "Cliente", obrigatorio: true, dicas: ["cliente", "razao", "razão", "nome", "destinatario"] },
  { chave: "total", rotulo: "Valor total", obrigatorio: true, dicas: ["total", "valor", "vlr", "liquido", "líquido"] },
  { chave: "codigo_cliente", rotulo: "Código do cliente", obrigatorio: false, dicas: ["codigo", "código", "cod", "cnpj"] },
  { chave: "forma_pag", rotulo: "Forma de pagamento", obrigatorio: false, dicas: ["forma", "pagamento", "pagto"] },
  { chave: "produto", rotulo: "Produto (linha de item)", obrigatorio: false, dicas: ["produto", "item", "descricao", "descrição"] },
  { chave: "qtd", rotulo: "Quantidade", obrigatorio: false, dicas: ["qtd", "quantidade", "qtde"] },
  { chave: "valor_item", rotulo: "Valor do item", obrigatorio: false, dicas: ["unitario", "unitário", "vlr item", "valor item"] },
] as const;

export type ChaveCampo = (typeof CAMPOS_IMPORT)[number]["chave"];
export type Mapeamento = Partial<Record<ChaveCampo, string>>;

/** Tira acento, pontuação e caixa — pra casar nome de cliente e cabeçalho. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sugere o de-para olhando o texto do cabeçalho. O usuário confirma. */
export function sugerirMapeamento(cabecalhos: string[]): Mapeamento {
  const m: Mapeamento = {};
  const usados = new Set<string>();
  for (const campo of CAMPOS_IMPORT) {
    const achou = cabecalhos.find((h) => {
      if (usados.has(h)) return false;
      const n = normalizar(h);
      return campo.dicas.some((d) => n.includes(normalizar(d)));
    });
    if (achou) {
      m[campo.chave] = achou;
      usados.add(achou);
    }
  }
  return m;
}

/**
 * "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "R$ 90,00" → 90
 * Decide pelo separador que aparece por último qual é o decimal.
 */
export function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.\-]/g, "").trim();
  if (!s) return null;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  let limpo: string;
  if (ultimaVirgula > ultimoPonto) limpo = s.replace(/\./g, "").replace(",", ".");
  else limpo = s.replace(/,/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aceita dd/mm/aaaa, aaaa-mm-dd, Date e o serial numérico do Excel.
 * Devolve sempre aaaa-mm-dd, ou null se não der pra confiar.
 */
export function parseData(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }

  // Serial do Excel: dias desde 30/12/1899. Faixa limitada de propósito, pra
  // não confundir um número solto de outra coluna com data.
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    let ano = m[3];
    if (ano.length === 2) ano = Number(ano) > 50 ? `19${ano}` : `20${ano}`;
    if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

export type LinhaBruta = Record<string, unknown>;

export type PedidoNormalizado = {
  pedido: string;
  data: string;
  clienteNome: string;
  codigoCliente: string | null;
  total: number;
  formaPag: string | null;
  /** Quem atendeu, da coluna "Atend." do Queóps. Mede venda por pessoa. */
  atendente: string | null;
  itens: { produto: string; qtd: number; valor: number | null }[];
};

export type Rejeitada = { linha: number; motivo: string };

/**
 * Agrupa as linhas do arquivo por pedido. Arquivos de ERP costumam trazer uma
 * linha por ITEM, repetindo o cabeçalho do pedido — por isso o total do pedido
 * é o primeiro não-nulo do grupo, nunca a soma (senão multiplicaria).
 */
export function normalizarLinhas(
  linhas: LinhaBruta[],
  map: Mapeamento
): { pedidos: PedidoNormalizado[]; rejeitadas: Rejeitada[] } {
  const porPedido = new Map<string, PedidoNormalizado>();
  const rejeitadas: Rejeitada[] = [];

  linhas.forEach((linha, i) => {
    const num = i + 2; // +1 pelo cabeçalho, +1 porque planilha começa em 1
    const pedido = String(map.pedido ? (linha[map.pedido] ?? "") : "").trim();
    const data = parseData(map.data ? linha[map.data] : null);
    const clienteNome = String(map.cliente ? (linha[map.cliente] ?? "") : "").trim();
    const total = parseNumero(map.total ? linha[map.total] : null);

    if (!pedido) return rejeitadas.push({ linha: num, motivo: "sem número de pedido" });
    if (!data) return rejeitadas.push({ linha: num, motivo: "data inválida ou vazia" });
    if (!clienteNome) return rejeitadas.push({ linha: num, motivo: "sem cliente" });

    let p = porPedido.get(pedido);
    if (!p) {
      p = {
        pedido,
        data,
        clienteNome,
        codigoCliente: map.codigo_cliente
          ? String(linha[map.codigo_cliente] ?? "").trim() || null
          : null,
        total: total ?? 0,
        formaPag: map.forma_pag ? String(linha[map.forma_pag] ?? "").trim() || null : null,
        atendente: null,
        itens: [],
      };
      porPedido.set(pedido, p);
    } else if (p.total === 0 && total) {
      p.total = total;
    }

    if (map.produto) {
      const produto = String(linha[map.produto] ?? "").trim();
      if (produto) {
        p.itens.push({
          produto,
          qtd: parseNumero(map.qtd ? linha[map.qtd] : null) ?? 1,
          valor: parseNumero(map.valor_item ? linha[map.valor_item] : null),
        });
      }
    }
  });

  return { pedidos: Array.from(porPedido.values()), rejeitadas };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Relatório "Histórico por cliente" do Queóps
 *
 * Não é uma tabela: é um relatório hierárquico. O cliente vem numa linha de
 * cabeçalho ("Cliente :"), os pedidos abaixo dele, e os itens em linhas soltas
 * logo após cada pedido. Nenhum de-para de colunas resolveria — por isso este
 * leitor dedicado, escolhido automaticamente quando o arquivo é reconhecido.
 *
 * Layout confirmado contra um export real de 12 a 18/08/26 (88 pedidos):
 *   col 0  "Cliente :"  → col 2 traz "CÓDIGO NOME" ou só "NOME"
 *   col 0  nº do pedido → col 1 data/hora, col 4 valor, col 5 forma de pagto
 *   col 11 produto      → qtd e valor DESLIZAM entre as colunas 12, 13 e 14
 *                         conforme a largura do número no relatório; a regra
 *                         é pegar os dois números presentes nessa faixa.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Matriz = unknown[][];

const cel = (l: unknown[], c: number): string => String(l?.[c] ?? "").trim();

/** Reconhece o relatório pelo cabeçalho da primeira página. */
export function ehRelatorioQueops(m: Matriz): boolean {
  const inicio = m.slice(0, 6).map((l) => cel(l, 0).toUpperCase());
  const temSistema = inicio.some((t) => t.includes("QUEÓPS") || t.includes("QUEOPS"));
  const temHistorico = m
    .slice(0, 20)
    .some((l) => cel(l, 0).toUpperCase().startsWith("CLIENTE"));
  return temSistema && temHistorico;
}

/** "13/08/26 16:22" → "2026-08-13" */
function dataQueops(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}

/** Números do relatório vêm no formato en-US: "1,234.56". */
function numQueops(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Onde cada coisa está, no bloco de cliente que está sendo lido.
 *
 * O relatório NÃO tem um layout só. Ele repete o cabeçalho
 * ("Pedido | Data/Hora | Atend. | Valor | Forma Pag. | … | Itens | Qtd. | Valor")
 * antes de cada cliente, e as colunas mudam de lugar entre um cliente e outro
 * conforme a largura do conteúdo. Num único export de 11/09 havia TRÊS layouts:
 * 67 blocos com o valor na coluna 4, 11 blocos na 5, e 3 com a quantidade do
 * item na 12 em vez da 13.
 *
 * Ler por posição fixa custava caro: 18 pedidos de 116 entravam com total zero
 * (o dinheiro ficava parado em `forma_pag`) e 28 tinham os itens lidos errado
 * ou nem lidos. A resposta estava no próprio arquivo — bastava ler o cabeçalho.
 */
export type LayoutQueops = {
  data: number;
  atend: number;
  valorPedido: number;
  forma: number;
  itens: number;
  qtd: number;
  valorItem: number;
};

/** O layout mais comum — vale até o primeiro cabeçalho aparecer. */
export const LAYOUT_PADRAO: LayoutQueops = {
  data: 1,
  atend: 3,
  valorPedido: 4,
  forma: 5,
  itens: 11,
  qtd: 13,
  valorItem: 14,
};

/** É a linha de cabeçalho que abre a tabela de um cliente? */
export function ehCabecalhoTabela(linha: unknown[]): boolean {
  return cel(linha, 0).toLowerCase() === "pedido";
}

/**
 * Traduz o cabeçalho em posições.
 *
 * "Valor" aparece DUAS vezes: a primeira é o valor do pedido, a última é o
 * valor do item. Confundir as duas põe o preço de uma empanada no lugar do
 * total do pedido.
 */
export function lerLayout(linha: unknown[]): LayoutQueops {
  const novo: LayoutQueops = { ...LAYOUT_PADRAO };
  let viuValor = false;
  for (let c = 0; c < linha.length; c++) {
    const t = cel(linha, c).toLowerCase().replace(/\./g, "").trim();
    if (!t) continue;
    if (t === "valor") {
      if (viuValor) novo.valorItem = c;
      else {
        novo.valorPedido = c;
        viuValor = true;
      }
    } else if (t.startsWith("data")) novo.data = c;
    else if (t.startsWith("atend")) novo.atend = c;
    else if (t.startsWith("forma")) novo.forma = c;
    else if (t === "itens") novo.itens = c;
    else if (t === "qtd") novo.qtd = c;
  }
  return novo;
}

/** "4:50:09 PM", "16:22", "6:46:28" — coluna de horário, nunca produto. */
function ehHora(s: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?(\s*[AP]\.?M\.?)?$/i.test(s.trim());
}

/**
 * Lê a linha de item ancorando no NOME do produto, não em coluna fixa.
 *
 * O cabeçalho do bloco não basta: no mesmo bloco, a linha do pedido pode ter o
 * valor na coluna que o cabeçalho indicou e os itens uma coluna adiante. As
 * duas metades da linha deslizam de forma independente.
 *
 * O nome do produto é a única coisa reconhecível sem ambiguidade — é texto num
 * trecho só de números. Achado ele, quantidade e valor são os dois próximos
 * números da linha. Ler por posição fazia 28 de 116 pedidos não fecharem com a
 * soma dos próprios itens, e um deles entrava sem item nenhum.
 */
export function lerItem(
  linha: unknown[],
  layout: LayoutQueops
): { produto: string; qtd: number; valor: number | null } | null {
  const inicio = Math.max(0, layout.itens - 1);
  let cProduto = -1;
  for (let c = inicio; c <= layout.itens + 2; c++) {
    const v = cel(linha, c);
    // Hora não é produto. As colunas de Produção/Entrega/Tempo ficam logo
    // antes das de item e trazem "4:50:09 PM" — texto, como o nome de um
    // produto. Sem esta guarda o horário virava o item, com a quantidade do
    // produto de verdade colada nele, e o produto real era descartado.
    if (v && numQueops(v) === null && !ehHora(v)) {
      cProduto = c;
      break;
    }
  }
  if (cProduto < 0) return null;

  const nums: number[] = [];
  for (let c = cProduto + 1; c <= cProduto + 4 && nums.length < 2; c++) {
    const n = numQueops(cel(linha, c));
    if (n !== null) nums.push(n);
  }
  return {
    produto: cel(linha, cProduto),
    qtd: nums[0] ?? 1,
    valor: nums.length >= 2 ? nums[1] : null,
  };
}

/**
 * Lê valor, atendente e forma de pagamento da linha do pedido.
 *
 * O relatório documenta col 3 = atendente, col 4 = valor, col 5 = forma de
 * pagto — mas as colunas DESLIZAM, do mesmo jeito que já era sabido nas linhas
 * de item. Números saem alinhados à direita: um valor mais largo começa antes
 * e cai na célula anterior, e uma coluna vazia empurra tudo pro lado.
 *
 * Ler col 4 fixo custou 7 vendas de 08 e 09/09 — R$ 3.405,90 gravados como
 * total zero, com o dinheiro parado em `forma_pag` ("646.25") ou em
 * `atendente` ("1254.15"). Como `eh_valido` é `total > 0`, essas vendas
 * sumiram da última compra, do placar e da carteira: a HEMELI comprou R$ 476
 * em 09/09 e seguia marcada como inativa desde julho.
 *
 * Agora procura o número na faixa 3–6 e fica com o mais próximo da coluna 4,
 * que é onde ele deveria estar. O texto à esquerda dele é o atendente; o à
 * direita, a forma de pagamento.
 */
export function lerCabecalhoPedido(
  linha: unknown[],
  layout: LayoutQueops = LAYOUT_PADRAO
): {
  total: number | null;
  atendente: string | null;
  formaPag: string | null;
} {
  // Caminho normal: o cabeçalho do bloco diz onde está cada coluna.
  const direto = numQueops(cel(linha, layout.valorPedido));
  if (direto !== null) {
    return {
      total: direto,
      atendente: normalizarAtendente(cel(linha, layout.atend)),
      formaPag: cel(linha, layout.forma) || null,
    };
  }

  // Rede de segurança: a coluna que o cabeçalho aponta veio vazia. Procura o
  // número em volta em vez de gravar zero e apagar a venda do sistema.
  const FAIXA = [layout.valorPedido - 1, layout.valorPedido, layout.valorPedido + 1, layout.valorPedido + 2];
  const ESPERADA = layout.valorPedido;

  const numeros = FAIXA.map((c) => ({ c, v: numQueops(cel(linha, c)) })).filter(
    (x): x is { c: number; v: number } => x.v !== null
  );
  numeros.sort((a, b) => Math.abs(a.c - ESPERADA) - Math.abs(b.c - ESPERADA));
  const achado = numeros[0] ?? null;

  // Sem número na faixa: cortesia e consumo interno saem sem valor no ERP.
  // Mantém a leitura por posição, que é a que sempre funcionou nesses casos.
  if (!achado) {
    return {
      total: null,
      atendente: normalizarAtendente(cel(linha, layout.atend)),
      formaPag: cel(linha, layout.forma) || null,
    };
  }

  const textos = FAIXA.map((c) => ({ c, v: cel(linha, c) })).filter(
    (x) => x.v !== "" && numQueops(x.v) === null
  );

  return {
    total: achado.v,
    atendente: normalizarAtendente(textos.find((t) => t.c < achado.c)?.v ?? ""),
    formaPag: textos.find((t) => t.c > achado.c)?.v ?? null,
  };
}

export function parseQueops(m: Matriz): {
  pedidos: PedidoNormalizado[];
  rejeitadas: Rejeitada[];
} {
  const pedidos: PedidoNormalizado[] = [];
  const rejeitadas: Rejeitada[] = [];
  let cliente: string | null = null;
  let clienteCodigo: string | null = null;
  let atual: PedidoNormalizado | null = null;
  // Vale até o próximo cabeçalho. Cada cliente pode trazer o seu.
  let layout: LayoutQueops = LAYOUT_PADRAO;

  m.forEach((linha, i) => {
    const num = i + 1;
    const c0 = cel(linha, 0);

    if (c0.toUpperCase().startsWith("CLIENTE")) {
      // col 2 traz "50.695.322 FULANO DE TAL" ou só "EMPRESA LTDA".
      // Esse prefixo fiscal É o codigo_cliente do cadastro — confirmado na base
      // (VINICIUS DA ROSA CORREA está com codigo_cliente "65.510.765").
      // Exige o formato com pontos: "6 PRO EVENTOS EMPRESARIAIS LTDA" tem
      // código C17 e o "6" faz parte do nome, não pode ser arrancado.
      const bruto = cel(linha, 2);
      const comCodigo = bruto.match(/^(\d{2,3}\.\d{3}\.\d{3})\s+(.+)$/);
      cliente = comCodigo ? comCodigo[2].trim() : bruto || null;
      clienteCodigo = comCodigo ? comCodigo[1] : null;
      atual = null;
      return;
    }

    // O cabeçalho da tabela deste cliente diz onde estão as colunas.
    if (ehCabecalhoTabela(linha)) {
      layout = lerLayout(linha);
      return;
    }

    if (/^\d{6,}$/.test(c0)) {
      const data = dataQueops(cel(linha, layout.data));
      const { total, atendente, formaPag } = lerCabecalhoPedido(linha, layout);
      if (!cliente) {
        rejeitadas.push({ linha: num, motivo: `pedido ${c0} sem cliente acima` });
        atual = null;
        return;
      }
      if (!data) {
        rejeitadas.push({ linha: num, motivo: `pedido ${c0} com data ilegível` });
        atual = null;
        return;
      }
      atual = {
        pedido: c0,
        data,
        clienteNome: cliente,
        codigoCliente: clienteCodigo,
        total: total ?? 0,
        formaPag,
        atendente,
        itens: [],
      };
      pedidos.push(atual);
    }

    const item = atual ? lerItem(linha, layout) : null;
    if (item && atual) {
      atual.itens.push(item);
    }
  });

  return { pedidos, rejeitadas };
}

/**
 * Confere a leitura somando os itens e comparando com o total do pedido.
 * É a única checagem que pega erro de coluna deslizada — sem ela, um valor
 * lido da coluna errada entraria como faturamento e ninguém veria.
 */
export function conferirSomas(pedidos: PedidoNormalizado[]): {
  conferem: number;
  semValor: number;
  divergem: { pedido: string; cliente: string; total: number; itens: number }[];
  /** Valor zero MAS com itens somando dinheiro — é coluna deslizada, não cortesia. */
  zeradosComItens: { pedido: string; cliente: string; itens: number }[];
} {
  let conferem = 0;
  let semValor = 0;
  const divergem: { pedido: string; cliente: string; total: number; itens: number }[] = [];
  const zeradosComItens: { pedido: string; cliente: string; itens: number }[] = [];
  for (const p of pedidos) {
    if (p.itens.length === 0) continue;
    // Cortesia, consumo interno, degustação e descarte saem com valor zero no
    // ERP de propósito. Não são erro de leitura — só não entram na conferência.
    //
    // Mas zero COM itens somando dinheiro não é cortesia: é o valor lido da
    // coluna errada. Esta conferência existe pra pegar coluna deslizada e
    // passava reto justamente quando o deslize zerava o total — o caso que ela
    // deveria pegar era o único que ela ignorava. Foi assim que 7 vendas de
    // 08 e 09/09 entraram como R$ 0,00 e sumiram da carteira.
    if (p.total === 0) {
      // "Cortesia" é a marca explícita do ERP pra brinde, degustação e consumo
      // interno: total zero com itens precificados é o normal deles, e são
      // dezenas. Sem esta exceção o aviso dispararia em toda importação e
      // viraria ruído — aviso que grita sempre não é lido quando importa.
      // É o mesmo critério do eh_valido no banco.
      const cortesia = (p.formaPag ?? "") === "Cortesia";
      const soma = p.itens.reduce((s, i) => s + (i.valor ?? 0), 0);
      if (!cortesia && soma > 0.02) {
        zeradosComItens.push({
          pedido: p.pedido,
          cliente: p.clienteNome,
          itens: Number(soma.toFixed(2)),
        });
      } else {
        semValor++;
      }
      continue;
    }
    const soma = p.itens.reduce((s, i) => s + (i.valor ?? 0), 0);
    if (Math.abs(soma - p.total) < 0.02) conferem++;
    else
      divergem.push({
        pedido: p.pedido,
        cliente: p.clienteNome,
        total: p.total,
        itens: Number(soma.toFixed(2)),
      });
  }
  return { conferem, semValor, divergem, zeradosComItens };
}


/**
 * O mesmo atendente aparece com grafias diferentes no mesmo arquivo
 * ("fernando" e "Fernando"). Sem normalizar, viram duas pessoas no relatório.
 */
export function normalizarAtendente(s: string): string | null {
  const limpo = s.trim().toLowerCase();
  if (!limpo) return null;
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

/** Pedidos e valor por dia — pra conferir de bate-pronto se algum dia veio torto. */
export function coberturaPorDia(
  pedidos: PedidoNormalizado[]
): { data: string; pedidos: number; valor: number }[] {
  const m = new Map<string, { pedidos: number; valor: number }>();
  for (const p of pedidos) {
    const d = m.get(p.data) ?? { pedidos: 0, valor: 0 };
    d.pedidos++;
    d.valor += p.total;
    m.set(p.data, d);
  }
  return Array.from(m.entries())
    .map(([data, d]) => ({ data, ...d }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Dias entre a última venda já registrada e o começo do arquivo.
 * Importação diária torna esquecer um dia rotineiro — e o dia pulado sumiria
 * em silêncio, porque o sistema só enxerga o que chegou, nunca o que faltou.
 * Ignora sábado e domingo: não há venda no fim de semana.
 */
export function diasFaltando(ultimaNoSistema: string | null, inicioDoArquivo: string): string[] {
  if (!ultimaNoSistema || inicioDoArquivo <= ultimaNoSistema) return [];
  const faltando: string[] = [];
  const d = new Date(ultimaNoSistema + "T12:00:00");
  const fim = new Date(inicioDoArquivo + "T12:00:00");
  d.setDate(d.getDate() + 1);
  while (d < fim) {
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) faltando.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return faltando;
}

/**
 * Dias úteis que o arquivo NÃO cobre, do fim dele até hoje.
 *
 * `diasFaltando` olha o buraco ANTES do arquivo — dia que ninguém importou. O
 * buraco depois é outro erro e passava em branco: pedir "de terça até hoje" no
 * ERP e receber um arquivo de um dia só. A importação dizia "16 novos", tudo
 * verde, e o placar da semana ficava R$ 9.675,50 abaixo do ERP sem explicação.
 */
export function diasAposArquivo(fimDoArquivo: string, hoje: string): string[] {
  if (fimDoArquivo >= hoje) return [];
  const out: string[] = [];
  const d = new Date(fimDoArquivo + "T12:00:00Z");
  const fim = new Date(hoje + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  while (d <= fim) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
