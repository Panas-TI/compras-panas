"use client";

import { useEffect, useState } from "react";

const PASSOS = [1.15, 1.35, 1.6, 1.9];

/**
 * Espelha a folha num monitor da produção.
 *
 * Tela cheia sozinha não resolve: sobram menu, abas e botões, e a tabela
 * continua do tamanho de quem está sentado na frente dela. Aqui as duas coisas
 * andam juntas — esconde a operação e amplia o que a produção precisa ler de
 * longe.
 */
export function BotaoTV() {
  const [ligado, setLigado] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    document.body.classList.toggle("modo-tv", ligado);
    document.body.style.setProperty("--tv-zoom", String(PASSOS[zoom]));
    return () => {
      document.body.classList.remove("modo-tv");
      document.body.style.removeProperty("--tv-zoom");
    };
  }, [ligado, zoom]);

  // Sair pelo ESC é o reflexo de quem está em tela cheia; sem isto o modo
  // continuaria ligado com a página já fora da tela cheia.
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setLigado(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const entrar = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Navegador pode recusar (ou já estar em tela cheia): o modo vale igual,
      // só sem esconder a barra do navegador.
    }
    setLigado(true);
  };

  const sair = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }
    setLigado(false);
  };

  if (!ligado) {
    return (
      <button
        onClick={entrar}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        title="Tela cheia e letras maiores, para espelhar na TV da produção"
      >
        📺 Modo TV
      </button>
    );
  }

  return (
    <div className="fixed right-3 top-3 z-50 flex items-center gap-1 rounded-full border border-zinc-300 bg-white/95 px-1.5 py-1 shadow-lg">
      <button
        onClick={() => setZoom((z) => Math.max(0, z - 1))}
        disabled={zoom === 0}
        className="h-8 w-8 rounded-full text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        title="Diminuir"
      >
        −
      </button>
      <span className="w-10 text-center text-xs tabular-nums text-zinc-500">
        {Math.round(PASSOS[zoom] * 100)}%
      </span>
      <button
        onClick={() => setZoom((z) => Math.min(PASSOS.length - 1, z + 1))}
        disabled={zoom === PASSOS.length - 1}
        className="h-8 w-8 rounded-full text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        title="Aumentar"
      >
        +
      </button>
      <button
        onClick={sair}
        className="ml-1 rounded-full px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
      >
        sair
      </button>
    </div>
  );
}
