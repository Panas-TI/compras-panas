/**
 * Quando cada cliente recebe, e quando ligar pra ele.
 *
 * A regra do negócio, escrita uma vez só: entrega de segunda a sexta, nunca
 * fim de semana; o pedido se fecha de 1 a 2 dias úteis antes; e a Serra tem um
 * único dia, a quinta. Tudo o que as telas mostram sai daqui — nenhuma tela
 * recalcula prazo por conta própria.
 */

export type Rota = "poa" | "caminho_serra" | "serra" | "litoral" | "a_definir";

export const ROTAS: Record<
  Rota,
  {
    rotulo: string;
    curto: string;
    desc: string;
    dias: number[];
    classe: string;
    /** Não há dia fixo: a data se combina pedido a pedido. */
    sobDemanda?: boolean;
  }
> = {
  poa: {
    rotulo: "Porto Alegre",
    curto: "POA",
    desc: "entrega de segunda a sexta",
    dias: [1, 2, 3, 4, 5],
    classe: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  caminho_serra: {
    rotulo: "Caminho da Serra",
    curto: "caminho",
    desc: "entrega qualquer dia útil — na quinta o motorista já passa por lá",
    dias: [1, 2, 3, 4, 5],
    classe: "bg-sky-50 text-sky-800 border-sky-200",
  },
  serra: {
    rotulo: "Serra",
    curto: "Serra",
    desc: "só quinta-feira — Gramado, Canela e região",
    dias: [4],
    classe: "bg-violet-100 text-violet-900 border-violet-300",
  },
  litoral: {
    rotulo: "Litoral",
    curto: "Litoral",
    desc: "sem dia fixo — a viagem é combinada pedido a pedido",
    // Dias úteis só para o cálculo não cair em sábado; a data real é combinada,
    // e por isso a tela não promete dia nenhum (ver `sobDemanda`).
    dias: [1, 2, 3, 4, 5],
    sobDemanda: true,
    classe: "bg-cyan-50 text-cyan-900 border-cyan-200",
  },
  a_definir: {
    rotulo: "Rota a definir",
    curto: "definir",
    desc: "tem indício de ser fora de Porto Alegre e ninguém confirmou ainda",
    // Trata como POA até alguém dizer o contrário: prometer quinta pra um
    // cliente que recebe todo dia perde venda; o contrário, só atrasa uma.
    dias: [1, 2, 3, 4, 5],
    classe: "bg-amber-100 text-amber-900 border-amber-300",
  },
};

export const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
export const DIAS_CURTO = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * Datas aqui são sempre "YYYY-MM-DD" do dia civil em Porto Alegre.
 *
 * Meio-dia UTC de propósito: `new Date("2026-09-11")` é meia-noite UTC, que no
 * Brasil ainda é dia 10. Ancorar no meio do dia tira qualquer chance de o
 * cálculo escorregar um dia por causa de fuso.
 */
function comoData(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** 1 = segunda … 7 = domingo. */
export function diaDaSemana(iso: string): number {
  const d = comoData(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function somarDias(iso: string, n: number): string {
  const d = comoData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ehDiaUtil(iso: string): boolean {
  return diaDaSemana(iso) <= 5;
}

/** Primeiro dia útil DEPOIS da data dada. */
export function proximoDiaUtil(iso: string): string {
  let d = somarDias(iso, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

/**
 * Se o pedido fechar hoje, quando chega.
 *
 * Piso de um dia útil pra todo mundo — pedido fechado hoje não sai hoje. Na
 * Serra, o piso ainda tem que cair numa quinta.
 */
export function proximaEntrega(rota: Rota, hoje: string): string {
  let d = proximoDiaUtil(hoje);
  const dias = ROTAS[rota].dias;
  while (!dias.includes(diaDaSemana(d))) d = somarDias(d, 1);
  return d;
}

/**
 * Em que dias ligar pra entregar num dia específico.
 *
 * De 1 a 2 dias ÚTEIS antes. Pra entrega na segunda isso cai no fim de semana,
 * então recua pra quinta e sexta da semana anterior — quem quer receber
 * segunda precisa ser trabalhado ainda na semana passada.
 */
export function recuarDiaUtil(dia: number, n: number): number {
  return (((dia - 1 - n) % 5) + 5) % 5 + 1;
}

export function quandoLigarPara(diaEntrega: number): number[] {
  return [recuarDiaUtil(diaEntrega, 2), recuarDiaUtil(diaEntrega, 1)];
}

export type Recado = {
  /** Data em que chega se o pedido fechar hoje. */
  entrega: string;
  /** Quantos dias corridos até lá. */
  emDias: number;
  /** Hoje é um bom dia pra ligar pra este cliente? */
  bom: boolean;
  /** A frase que o vendedor lê — e repete no telefone. */
  texto: string;
};

/**
 * O que dizer pra este cliente HOJE.
 *
 * É a peça que tira o "pensar" da operação: em vez de a pessoa lembrar que a
 * Serra é quinta e que o prazo é 1 a 2 dias, a linha já vem pronta.
 */
export function recadoDoDia(rota: Rota, hoje: string): Recado {
  const entrega = proximaEntrega(rota, hoje);

  // Rota sem dia fixo não pode virar promessa. Dizer "chega amanhã" para o
  // Litoral seria inventar uma viagem que só existe quando é combinada — pior
  // do que não informar, porque o cliente ouve isso no telefone.
  if (ROTAS[rota].sobDemanda) {
    return {
      entrega,
      emDias: 0,
      bom: true,
      texto: "entrega no Litoral é sob demanda — combine a data ao fechar o pedido",
    };
  }
  const emDias = Math.round(
    (comoData(entrega).getTime() - comoData(hoje).getTime()) / 86_400_000
  );
  const dia = DIAS[diaDaSemana(entrega)];
  // 5+ dias sempre carrega "que vem": de sexta pra quinta são 6 dias, e só
  // "chega quinta" faria o vendedor prometer a quinta de amanhã.
  const quando =
    emDias === 1 ? `amanhã (${dia})` : emDias >= 5 ? `${dia} que vem` : dia;

  // Serra fora da janela: ligar hoje não alcança a quinta desta semana.
  const perdeuASemana = rota === "serra" && emDias > 4;

  return {
    entrega,
    emDias,
    bom: !perdeuASemana,
    texto: perdeuASemana
      ? `Serra só quinta — fechando hoje, só chega ${quando}`
      : `fechando hoje, chega ${quando}`,
  };
}

/** "costuma pedir segunda · ligar quinta ou sexta" — null quando não há padrão. */
export function rotinaDoCliente(diaHabitual: number | null): string | null {
  if (!diaHabitual || diaHabitual < 1 || diaHabitual > 5) return null;
  const [a, b] = quandoLigarPara(diaHabitual);
  return `costuma pedir ${DIAS[diaHabitual]} · ligar ${DIAS[a]} ou ${DIAS[b]}`;
}

/** Hoje é um dos dias de ligar pra quem pede no dia habitual dele? */
export function hojeEhODia(diaHabitual: number | null, hoje: string): boolean {
  if (!diaHabitual) return false;
  return quandoLigarPara(diaHabitual).includes(diaDaSemana(hoje));
}
