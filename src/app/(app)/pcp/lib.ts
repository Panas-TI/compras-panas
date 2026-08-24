/** Código curto do produto — "02. CARNE" → "2". É como a produção o chama. */
export function codigoCurto(nome: string): string {
  const m = nome.match(/^\s*(\d{1,3})\s*[.\s]/);
  return m ? String(Number(m[1])) : "—";
}

/** "02. CARNE" → "CARNE". O código aparece na coluna ao lado. */
export function nomeLimpo(nome: string): string {
  return nome.replace(/^\s*\d{1,3}\s*[.\s]\s*/, "").trim() || nome;
}

export const hhmm = (t: string) => t.slice(0, 5);

export type SituacaoTurno = "agora" | "proximo" | "encerrado";

/**
 * Situação do turno em relação ao relógio. É o que faz a folha na parede
 * dirigir em vez de só informar: a colaboradora vê qual coluna é a de agora.
 */
export function situacaoTurno(inicio: string, fim: string, agora: Date): SituacaoTurno {
  const min = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  if (min >= hf * 60 + mf) return "encerrado";
  if (min >= hi * 60 + mi) return "agora";
  return "proximo";
}

/** Cor do realizado contra o projetado: abaixo puxa atenção, acima é ganho. */
export function desvioClasse(projetado: number, realizado: number | null): string {
  if (realizado === null) return "text-zinc-300";
  if (realizado < projetado) return "text-red-600";
  if (realizado > projetado) return "text-emerald-600";
  return "text-zinc-900";
}
