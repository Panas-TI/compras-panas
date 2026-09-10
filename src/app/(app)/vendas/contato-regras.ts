/**
 * Regras do registro de contato, num lugar só.
 *
 * O formulário completo e os botões de um clique da bandeja "Aguardando
 * resposta" precisam calcular a MESMA data de retorno. Quando essa conta vivia
 * dentro do componente do formulário, qualquer segunda tela que registrasse
 * contato nasceria com uma regra paralela pra manter em sincronia.
 */

export const RESULTADOS = [
  { v: "vai_comprar", label: "Vai comprar", adiaDias: 2 },
  { v: "comprou", label: "Comprou agora", adiaDias: 0 },
  { v: "nao_agora", label: "Não agora", adiaDias: 14 },
  // "Ainda" de propósito: é estado provisório, não veredito. O cliente que
  // responde duas horas depois cai na bandeja e este registro é corrigido —
  // por isso a palavra não pode soar como desfecho.
  { v: "sem_resposta", label: "Ainda sem resposta", adiaDias: 1 },
  { v: "recusou", label: "Não quer mais", adiaDias: 90 },
] as const;

export const CANAIS = ["whatsapp", "telefone", "presencial", "email"] as const;

/** Dias de antecedência: o vendedor precisa falar antes do estoque acabar. */
export const ANTECEDENCIA = 3;

/**
 * Sem histórico suficiente não dá pra prever o ritmo. Presume 10 dias — mesmo
 * número usado em recalcular_metricas_vendas() pra fila do cliente novo; se
 * divergissem, o cliente voltaria pra fila em data diferente da prometida aqui.
 */
export const PADRAO_SEM_CICLO = 10;

/**
 * Por quanto tempo um contato aceita correção.
 *
 * Existe pra impedir que alguém reescreva conversa antiga. Passou disso, foi
 * outra conversa: registra-se um contato novo e o histórico continua honesto.
 */
export const JANELA_EDICAO_DIAS = 7;

/**
 * Teto de idade da bandeja "Aguardando resposta".
 *
 * Não é o que define quem sai dela — quem define é o `adiar_ate`: enquanto a
 * data de retorno não venceu, o cliente está silenciado na fila e só a bandeja
 * o mostra; quando vence, ele reaparece sozinho como "retorno combinado" no
 * plano do dia e sai daqui. Sem essa amarração, um mesmo cliente apareceria
 * duas vezes na mesma tela a partir do segundo dia.
 *
 * É o MESMO número da janela de edição de propósito. Com 14 aqui e 7 lá, um
 * contato com data de retorno longa ficava listado com os três botões
 * habilitados do dia 8 ao 14, e todo clique voltava "tem mais de 7 dias" — sem
 * nenhum caminho na tela para resolver a linha. Bandeja não pode oferecer o
 * que o servidor recusa.
 */
export const TETO_BANDEJA_DIAS = JANELA_EDICAO_DIAS;

/**
 * Fuso fixo pra rotular horários.
 *
 * O servidor da Vercel roda em UTC e o vendedor está em Porto Alegre. Formatar
 * com o fuso da máquina mostraria 13h40 pro contato das 10h40 — e formatar no
 * cliente daria divergência de hidratação, porque servidor e navegador
 * chegariam a strings diferentes. Fixar o fuso resolve os dois.
 */
const TZ = "America/Sao_Paulo";

/** Dia civil em Porto Alegre, no formato YYYY-MM-DD. */
export function diaEmSP(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "hoje 10h40", "ontem 16h05", "27/08 09h20". */
export function rotuloQuando(criadoEm: string): string {
  const dia = diaEmSP(criadoEm);
  const hoje = diaEmSP(new Date());
  const anteontem = new Date();
  anteontem.setDate(anteontem.getDate() - 1);
  const ontem = diaEmSP(anteontem);

  const hora = new Date(criadoEm)
    .toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");

  if (dia === hoje) return `hoje ${hora}`;
  if (dia === ontem) return `ontem ${hora}`;
  return `${ddmm(dia)} ${hora}`;
}

/**
 * Data de hoje mais N dias, no dia civil de Porto Alegre.
 *
 * Antes usava toISOString(), que devolve o dia em UTC. Isso não fazia diferença
 * enquanto a conta rodava só no navegador do vendedor — mas a correção de
 * contato roda no servidor da Vercel, que é UTC. Das 21h à meia-noite os dois
 * discordam em um dia: um "ainda sem resposta" registrado às 21h30 ganhava
 * retorno para depois de amanhã, e o cliente ficava preso dois dias em vez de
 * um. Trabalhar de noite é normal aqui, então o erro seria diário.
 */
export function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return diaEmSP(d);
}

export function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Quando o cliente compra, quem decide o retorno é o sistema, não o vendedor:
 * volta 3 dias antes da próxima compra prevista pelo ciclo dele. Piso de 1 dia
 * porque há cliente de ciclo curto (2 dias) em que o cálculo cairia no passado.
 */
export function diasAteVoltar(intervalo: number | null): number {
  if (!intervalo) return PADRAO_SEM_CICLO;
  return Math.max(1, intervalo - ANTECEDENCIA);
}

/**
 * Data de retorno de um contato.
 *
 * "Comprou agora" ignora qualquer data digitada: sem isso o cliente voltaria
 * pra fila amanhã, porque a venda só entra no sistema na importação seguinte.
 */
export function calcularAdiarAte(
  resultado: string,
  intervalo: number | null,
  escolhida?: string | null
): string | null {
  if (resultado === "comprou") return hojeMais(diasAteVoltar(intervalo));
  if (escolhida) return escolhida;
  const dias = RESULTADOS.find((r) => r.v === resultado)?.adiaDias ?? 0;
  return dias > 0 ? hojeMais(dias) : null;
}

/** Dias inteiros desde o registro. */
export function diasDesde(criadoEm: string): number {
  const d = new Date(criadoEm);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/**
 * Ainda dá pra corrigir este contato?
 *
 * Compara instantes, não dias inteiros. Com arredondamento por piso, um contato
 * das 09h de sete dias atrás ainda dava "7" às 14h de hoje: a tela oferecia
 * "Corrigir resposta", o servidor deixava passar e o trigger no banco — que usa
 * `now() - interval '7 days'` — recusava. Uma faixa de até 24h em que a
 * interface prometia o que o banco negava.
 *
 * Quem checa se é o contato mais recente do cliente é o servidor, que enxerga
 * a tabela inteira.
 */
export function dentroDaJanela(criadoEm: string): boolean {
  return Date.now() - new Date(criadoEm).getTime() <= JANELA_EDICAO_DIAS * 86_400_000;
}

/**
 * Início do dia em Porto Alegre, pronto pra comparar com timestamptz.
 *
 * `${dia}T00:00:00` sem offset é lido como UTC pelo Postgres — o banco roda em
 * UTC. Mesmo com o dia certo, o corte pegava desde as 21h da véspera: o placar
 * "X de 50" e o "✓ falado hoje" herdavam as três últimas horas do dia anterior.
 */
export function inicioDoDiaSP(dia: string): string {
  return `${dia}T00:00:00-03:00`;
}
