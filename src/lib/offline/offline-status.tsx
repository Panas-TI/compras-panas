"use client";

import { useOffline } from "./use-offline";

/**
 * Badge mostrando estado de conexão + fila de sync.
 * Renderiza só no client (evita hydration mismatch).
 */
export function OfflineStatus() {
  const { online, pendentes, sincronizando, sync } = useOffline();

  // Tudo OK e sem fila → mostra "Online" discreto
  if (online && pendentes === 0 && !sincronizando) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Online
      </div>
    );
  }

  // Offline (com ou sem pendentes)
  if (!online) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Offline
        {pendentes > 0 && (
          <span className="font-bold">· {pendentes} pra sincronizar</span>
        )}
      </div>
    );
  }

  // Online com pendentes (sincronizando ou parado)
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs text-blue-900">
      <span
        className={`h-2 w-2 rounded-full ${sincronizando ? "animate-pulse bg-blue-500" : "bg-blue-500"}`}
      />
      {sincronizando ? "Sincronizando…" : `${pendentes} pra sincronizar`}
      {!sincronizando && pendentes > 0 && (
        <button
          type="button"
          onClick={sync}
          className="ml-1 rounded bg-blue-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          Sincronizar
        </button>
      )}
    </div>
  );
}
