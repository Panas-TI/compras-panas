/**
 * Sincronização da fila offline.
 *
 * Pega todas as entregas pendentes do IndexedDB e tenta concluir uma a uma.
 * - Sucesso → remove
 * - Erro terminal (já entregue, outro motorista, não cadastrado) → remove (caso perdido)
 * - Erro transitório (rede, 5xx) → mantém, incrementa tentativas
 */

import {
  listarPendentes,
  removerPendente,
  atualizarPendente,
  blobToBase64,
  type EntregaPendente,
} from "./db";

export type SyncEvent =
  | { tipo: "start"; total: number }
  | { tipo: "ok"; codigo: string; restantes: number }
  | { tipo: "removido"; codigo: string; razao: string; restantes: number }
  | { tipo: "falha"; codigo: string; erro: string; restantes: number }
  | { tipo: "done"; sucesso: number; removidos: number; falhas: number };

const ERROS_TERMINAIS = [
  "já entregue",
  "já marcado",
  "atribuído a outro",
  "não está cadastrado",
  "não encontrado",
  "cancelado",
];

function eErroTerminal(msg: string): boolean {
  const m = msg.toLowerCase();
  return ERROS_TERMINAIS.some((e) => m.includes(e));
}

export async function sincronizar(
  onEvento?: (e: SyncEvent) => void
): Promise<{ sucesso: number; removidos: number; falhas: number }> {
  const pendentes = await listarPendentes();
  onEvento?.({ tipo: "start", total: pendentes.length });

  let sucesso = 0;
  let removidos = 0;
  let falhas = 0;

  for (let i = 0; i < pendentes.length; i++) {
    const p = pendentes[i];
    try {
      const fotoBase64 = await blobToBase64(p.fotoBlob);
      const r = await fetch("/api/motorista/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entregaId: p.entregaId,
          fotoBase64,
          mediaType: p.mediaType,
          gps: p.gps,
        }),
      });
      const text = await r.text();
      let body: { ok?: boolean; error?: string };
      try {
        body = JSON.parse(text);
      } catch {
        // resposta não-JSON = transient (HTML de erro / network)
        await atualizarPendente(p.id, {
          tentativas: p.tentativas + 1,
          ultimoErro: `HTTP ${r.status}: ${text.slice(0, 100)}`,
        });
        falhas++;
        onEvento?.({
          tipo: "falha",
          codigo: p.codigo,
          erro: `HTTP ${r.status}`,
          restantes: pendentes.length - i - 1,
        });
        continue;
      }

      if (body.ok) {
        await removerPendente(p.id);
        sucesso++;
        onEvento?.({ tipo: "ok", codigo: p.codigo, restantes: pendentes.length - i - 1 });
        continue;
      }

      // body.ok === false
      const erroMsg = body.error ?? "erro desconhecido";
      if (eErroTerminal(erroMsg)) {
        await removerPendente(p.id);
        removidos++;
        onEvento?.({
          tipo: "removido",
          codigo: p.codigo,
          razao: erroMsg,
          restantes: pendentes.length - i - 1,
        });
      } else {
        await atualizarPendente(p.id, {
          tentativas: p.tentativas + 1,
          ultimoErro: erroMsg,
        });
        falhas++;
        onEvento?.({
          tipo: "falha",
          codigo: p.codigo,
          erro: erroMsg,
          restantes: pendentes.length - i - 1,
        });
      }
    } catch (e) {
      // network error / offline / fetch falhou
      const msg = e instanceof Error ? e.message : String(e);
      await atualizarPendente(p.id, {
        tentativas: p.tentativas + 1,
        ultimoErro: msg,
      });
      falhas++;
      onEvento?.({
        tipo: "falha",
        codigo: p.codigo,
        erro: msg,
        restantes: pendentes.length - i - 1,
      });
      // Se network error, para o loop — não adianta tentar os próximos
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        break;
      }
    }
  }

  onEvento?.({ tipo: "done", sucesso, removidos, falhas });
  return { sucesso, removidos, falhas };
}

/** Re-exporta pra facilitar imports */
export type { EntregaPendente };
