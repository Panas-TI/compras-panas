"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker (/sw.js) pra permitir cache offline da página /motorista.
 * Roda só uma vez no mount. No-op em browsers sem suporte ou em dev.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Em desenvolvimento o cache atrapalha mais do que ajuda
    if (window.location.hostname === "localhost") return;

    const url = "/sw.js";
    navigator.serviceWorker.register(url).catch(() => {
      // Silencia erro de registro — não é crítico, app funciona online normal
    });
  }, []);

  return null;
}
