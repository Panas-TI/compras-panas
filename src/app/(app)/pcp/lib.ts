/** Código curto do produto — "02. CARNE" → "02". É como a produção o chama. */
export function codigoCurto(nome: string): string | null {
  const m = nome.match(/^\s*(\d{1,3})\s*[.\s]/);
  return m ? m[1].padStart(2, "0") : null;
}

/** "02. CARNE" → "CARNE". O código já aparece destacado ao lado. */
export function nomeLimpo(nome: string): string {
  return nome.replace(/^\s*\d{1,3}\s*[.\s]\s*/, "").trim() || nome;
}

export type SituacaoTurno = "agora" | "proximo" | "encerrado";

/**
 * Situação do turno em relação ao relógio.
 *
 * É o que faz o painel dirigir em vez de só informar: numa tela pendurada na
 * parede, a colaboradora precisa saber o que fazer AGORA, não ler a lista
 * inteira e calcular o horário de cabeça.
 */
export function situacaoTurno(
  inicio: string,
  fim: string,
  agora: Date
): SituacaoTurno {
  const min = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const ini = hi * 60 + mi;
  const f = hf * 60 + mf;
  if (min >= f) return "encerrado";
  if (min >= ini) return "agora";
  return "proximo";
}

export const hhmm = (t: string) => t.slice(0, 5);
