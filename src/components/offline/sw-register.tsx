"use client";

import { useEffect } from "react";

/**
 * Registra o service worker `/sw.js` no client.
 * Falha silenciosamente se o navegador não suportar.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return; // SW só funciona em HTTPS/localhost

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => undefined);
  }, []);

  return null;
}
