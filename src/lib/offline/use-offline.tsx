"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contarPendentes } from "./db";
import { sincronizar } from "./sync";

/**
 * Hook que monitora estado online/offline e a quantidade de pendentes
 * na fila de sincronização. Também expõe `sync()` pra rodar manualmente.
 */
export function useOffline() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendentes, setPendentes] = useState<number>(0);
  const [sincronizando, setSincronizando] = useState<boolean>(false);
  const [ultimoSyncResultado, setUltimoSyncResultado] = useState<{
    sucesso: number;
    removidos: number;
    falhas: number;
  } | null>(null);
  const tentouSyncInicial = useRef<boolean>(false);

  const recarregarPendentes = useCallback(async () => {
    try {
      const n = await contarPendentes();
      setPendentes(n);
    } catch {
      // IndexedDB pode não estar disponível em modo private etc — ignora
    }
  }, []);

  const sync = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const res = await sincronizar();
      setUltimoSyncResultado(res);
    } finally {
      setSincronizando(false);
      await recarregarPendentes();
    }
  }, [sincronizando, recarregarPendentes]);

  useEffect(() => {
    recarregarPendentes();

    const onOnline = () => {
      setOnline(true);
      // Auto-sync ao voltar online (se tem fila)
      contarPendentes().then((n) => {
        if (n > 0) sync();
      });
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Sync inicial se já estava online com pendentes acumulados
    if (!tentouSyncInicial.current && navigator.onLine) {
      tentouSyncInicial.current = true;
      contarPendentes().then((n) => {
        if (n > 0) sync();
      });
    }

    // Poll de pendentes a cada 5s (caso outro tab adicione)
    const interval = setInterval(recarregarPendentes, 5000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    online,
    pendentes,
    sincronizando,
    ultimoSyncResultado,
    sync,
    recarregarPendentes,
  };
}
