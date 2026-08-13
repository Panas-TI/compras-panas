export type SolicStatusDisplay =
  | "Rascunho"
  | "Em aprovação"
  | "Em recebimento"
  | "Finalizada";

/**
 * Mesma regra de computeSolicStatus, a partir das contagens já agregadas no
 * banco (view solicitacoes_resumo). Evita trazer todas as linhas só pra contar
 * — o que estourava o limite de 1000 linhas do PostgREST em listas grandes.
 */
export function solicStatusFromCounts(
  enviada_em: string | null,
  pendentesAprovacao: number,
  pendentesRecebimento: number
): SolicStatusDisplay {
  if (!enviada_em) return "Rascunho";
  if (pendentesAprovacao > 0) return "Em aprovação";
  if (pendentesRecebimento > 0) return "Em recebimento";
  return "Finalizada";
}

export function computeSolicStatus(
  enviada_em: string | null,
  linhas: Array<{ status: string; alteracao_confirmada: boolean }>
): SolicStatusDisplay {
  if (!enviada_em) return "Rascunho";

  let pendingApproval = 0;
  let pendingReceipt = 0;

  for (const l of linhas) {
    if (l.status === "Para Aprovar") {
      pendingApproval++;
    } else if (l.status === "Volumes ou Preço Alterados" && !l.alteracao_confirmada) {
      pendingApproval++;
    } else if (l.status === "Aprovada") {
      pendingReceipt++;
    } else if (l.status === "Volumes ou Preço Alterados" && l.alteracao_confirmada) {
      pendingReceipt++;
    }
    // "Aprovada & Recebida" e "Recusada" são terminais — não contam pra pendência
  }

  if (pendingApproval > 0) return "Em aprovação";
  if (pendingReceipt > 0) return "Em recebimento";
  return "Finalizada";
}

export function statusColorClass(s: SolicStatusDisplay): string {
  switch (s) {
    case "Rascunho":
      return "text-amber-700";
    case "Em aprovação":
      return "text-blue-700";
    case "Em recebimento":
      return "text-violet-700";
    case "Finalizada":
      return "text-zinc-500";
  }
}
