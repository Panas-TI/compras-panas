/**
 * Sincronização da fila de bipadas offline.
 *
 * Pega todas as pendentes do IndexedDB e tenta enviar uma a uma via Server Action.
 * - Sucesso: remove do queue.
 * - Erro de duplicidade (já entregue, outro motorista, não cadastrado): remove
 *   também (caso terminal, não adianta retry).
 * - Erro de rede / 5xx: incrementa tentativas; mantém na fila.
 */

import { listarPendentes, removerPendente, atualizarPendente } from "./db";
import { marcarEntregueAction } from "@/app/(app)/motorista/actions";

const ERROS_TERMINAIS = new Set([
  "nao_encontrado",
  "outro_motorista",
  "outro_dia",
  "ja_entregue",
]);

export type SyncResult = {
  total: number;
  sucesso: number;
  removidos_por_erro: number; // erros terminais
  falhas: number; // erros transitórios
};

/**
 * Processa todas as pendentes uma a uma.
 * onProgress é chamado a cada item processado.
 */
export async function sincronizarPendentes(
  onProgress?: (item: { codigo: string; status: "ok" | "removido" | "falha" }) => void
): Promise<SyncResult> {
  const pendentes = await listarPendentes();
  const result: SyncResult = {
    total: pendentes.length,
    sucesso: 0,
    removidos_por_erro: 0,
    falhas: 0,
  };

  for (const p of pendentes) {
    if (p.id === undefined) continue;
    try {
      const res = await marcarEntregueAction(p.codigo, p.gps);
      if (!res) {
        result.falhas++;
        onProgress?.({ codigo: p.codigo, status: "falha" });
        continue;
      }
      if (res.ok) {
        await removerPendente(p.id);
        result.sucesso++;
        onProgress?.({ codigo: p.codigo, status: "ok" });
        continue;
      }
      // não ok
      if (ERROS_TERMINAIS.has(res.reason)) {
        await removerPendente(p.id);
        result.removidos_por_erro++;
        onProgress?.({ codigo: p.codigo, status: "removido" });
      } else {
        await atualizarPendente({
          ...p,
          tentativas: p.tentativas + 1,
          ultimoErro: res.message,
        });
        result.falhas++;
        onProgress?.({ codigo: p.codigo, status: "falha" });
      }
    } catch (e) {
      // erro de rede
      await atualizarPendente({
        ...p,
        tentativas: p.tentativas + 1,
        ultimoErro: e instanceof Error ? e.message : String(e),
      });
      result.falhas++;
      onProgress?.({ codigo: p.codigo, status: "falha" });
    }
  }

  return result;
}
