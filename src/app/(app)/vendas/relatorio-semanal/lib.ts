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
