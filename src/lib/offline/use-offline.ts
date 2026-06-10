"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contarPendentes } from "./db";
import { sincronizarPendentes, type SyncResult } from "./queue-sync";

export type OfflineState = {
  online: boolean;
  pendentes: number;
  sincronizando: boolean;
  ultimaSync: SyncResult | null;
};

export function useOffline(opts?: {
  /** Callback toda vez que uma bipada da fila for sincronizada com sucesso. */
  onSyncSuccess?: () => void;
}) {
  const [state, setState] = useState<OfflineState>({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    pendentes: 0,
    sincronizando: false,
    ultimaSync: null,
  });

  const sincronizandoRef = useRef(false);
  const callbackRef = useRef(opts?.onSyncSuccess);
  callbackRef.current = opts?.onSyncSuccess;

  const recontar = useCallback(async () => {
    try {
      const n = await contarPendentes();
      setState((s) => ({ ...s, pendentes: n }));
    } catch {
      // ignora — IndexedDB pode estar bloqueado
    }
  }, []);

  const tentarSincronizar = useCallback(async () => {
    if (sincronizandoRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const n = await contarPendentes().catch(() => 0);
    if (n === 0) return;

    sincronizandoRef.current = true;
    setState((s) => ({ ...s, sincronizando: true }));
    let teveSucesso = false;
    try {
      const result = await sincronizarPendentes((item) => {
        if (item.status === "ok") teveSucesso = true;
      });
      setState((s) => ({ ...s, ultimaSync: result }));
    } finally {
      sincronizandoRef.current = false;
      setState((s) => ({ ...s, sincronizando: false }));
      await recontar();
      if (teveSucesso) callbackRef.current?.();
    }
  }, [recontar]);

  useEffect(() => {
    const onOnline = () => {
      setState((s) => ({ ...s, online: true }));
      tentarSincronizar();
    };
    const onOffline = () => setState((s) => ({ ...s, online: false }));

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Sync ao montar (caso já tenha pendente)
    tentarSincronizar();
    recontar();

    // Polling leve a cada 30s pra recontar
    const t = setInterval(recontar, 30000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(t);
    };
  }, [recontar, tentarSincronizar]);

  return {
    ...state,
    recontar,
    tentarSincronizar,
  };
}
