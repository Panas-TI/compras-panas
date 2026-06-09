/**
 * OCR de pedidos impressos do Queóps via Claude API.
 *
 * Recebe imagem (base64 + mediaType) e retorna campos estruturados
 * para revisão humana antes de salvar.
 */
import Anthropic from "@anthropic-ai/sdk";

// Modelo: Claude Sonnet 4.5 (suporta input de imagem, bom em OCR estruturado).
const MODEL = "claude-sonnet-4-5";

// Preços por milhão de tokens (Sonnet 4.5, USD)
// Fonte: https://docs.anthropic.com/claude/docs/models-overview
const PRICE_INPUT_PER_MTOK = 3.0;
const PRICE_OUTPUT_PER_MTOK = 15.0;

export type ItemPedido = {
  quantidade: number | null;
  codigo: string | null;
  nome: string | null;
  valor: number | null;
};

export type DadosExtraidos = {
  codigo_queops: string | null;
  data_entrega: string | null; // ISO YYYY-MM-DD
  hora_entrega: string | null; // HH:MM
  area_entrega: number | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  contato_nome: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  valor_total: number | null;
  total_fisico: number | null;
  itens: ItemPedido[];
};

export type ExtractResult = {
  dados: DadosExtraidos;
  custo_usd: number;
  tokens_input: number;
  tokens_output: number;
};

const SYSTEM_PROMPT = `Você é um extrator de dados de pedidos de entrega impressos do ERP Queóps.

Cada pedido tem estes campos visíveis na folha A4:
- Código de barras + número (formato C seguido de dígitos, ex: C010022310554) no topo
- Tipo do pedido (REIMPRESSO, Pedido Entrega)
- "Entrega Data" no formato DD/MM/AA seguido do dia da semana
- "Hora" no formato HH:MM
- "Área Entrega" (número inteiro pequeno)
- "Telefone" do cliente (formato (DD) 9XXXX-XXXX ou similar)
- "Cliente": razão social ou nome (pode ter LTDA, ME, etc)
- "Bairro"
- "Endereço": rua, número, complemento (separados por vírgula ou em uma linha)
- "Cidade" e "UF" (ex: Porto Alegre/RS)
- "Obs.:" observações livres — CAPTURE NA ÍNTEGRA, é onde aparecem instruções tipo "ENTREGAR DAS 7H AS 9H", "NAO COBRAR TAXA", etc.
- "Contato": nome da pessoa de contato
- Itens do pedido em linhas tipo "30x - 21. 4 QUEIJOS    198,00"
  (quantidade x - número_ordem. nome_produto    valor)
- "Total Físico": número total de unidades
- "TOTAL PEDIDO": valor em R$ (pode ter R$ ou só número, com vírgula decimal)
- No rodapé: Atendente, Usuário, Qtd Pedidos, Data/hora de reimpressão

Regras de extração:
- Retorne APENAS JSON válido (sem markdown, sem explicação, sem texto adicional)
- Datas em formato ISO YYYY-MM-DD (converta DD/MM/AA para 20AA-MM-DD)
- Horas em HH:MM
- Valores monetários como número (ex: 1234.56), NÃO como string
- UF sempre 2 letras maiúsculas
- Se um campo não estiver visível ou ilegível, retorne null
- NÃO INVENTE NADA — só o que está escrito
- Para itens: extraia TODOS os itens listados, mesmo se forem muitos
- Telefone: mantenha a formatação original do documento

Schema exato a retornar:
{
  "codigo_queops": string|null,
  "data_entrega": "YYYY-MM-DD"|null,
  "hora_entrega": "HH:MM"|null,
  "area_entrega": number|null,
  "cliente_nome": string|null,
  "cliente_telefone": string|null,
  "contato_nome": string|null,
  "endereco_rua": string|null,
  "endereco_numero": string|null,
  "endereco_complemento": string|null,
  "bairro": string|null,
  "cidade": string|null,
  "uf": string|null,
  "observacoes": string|null,
  "valor_total": number|null,
  "total_fisico": number|null,
  "itens": [{"quantidade": number|null, "codigo": string|null, "nome": string|null, "valor": number|null}]
}`;

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function extrairDadosDoPedido(
  imageBase64: string,
  mediaType: MediaType
): Promise<ExtractResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Adicione em .env.local e tente novamente."
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    // Prompt caching no system pra economia se o mesmo prompt for usado muitas vezes na hora.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Extraia os dados deste pedido de entrega impresso e retorne APENAS o JSON conforme o schema definido.",
          },
        ],
      },
    ],
  });

  // Junta os blocos de texto da resposta
  const textOut = msg.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  // Remove cercas de código se vierem por acaso
  const cleaned = textOut
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let dados: DadosExtraidos;
  try {
    dados = JSON.parse(cleaned) as DadosExtraidos;
  } catch {
    throw new Error(
      `Falha ao parsear JSON do Claude. Resposta crua: ${textOut.slice(0, 300)}`
    );
  }

  // Defaults seguros pra campos opcionais
  dados.itens = Array.isArray(dados.itens) ? dados.itens : [];

  const tokensIn = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  const tokensOut = msg.usage.output_tokens;
  const custo =
    (msg.usage.input_tokens * PRICE_INPUT_PER_MTOK) / 1_000_000 +
    (tokensOut * PRICE_OUTPUT_PER_MTOK) / 1_000_000;

  return {
    dados,
    custo_usd: Math.round(custo * 10000) / 10000,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
  };
}
