"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Exportar CSV com escolha do conteúdo: tudo ou só o que foi aprovado.
 * O financeiro normalmente quer só as aprovadas (é o que vira compra);
 * a solicitação inteira serve pra conferência do que foi pedido x recusado.
 */
export function ExportarCsvMenu({
  solicitacaoId,
  totalLinhas,
  linhasAprovadas,
}: {
  solicitacaoId: string;
  totalLinhas: number;
  linhasAprovadas: number;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  const base = `/api/solicitacoes/${solicitacaoId}/csv`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
      >
        Exportar CSV
        <span className="text-[10px] text-zinc-500">▾</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-50 w-64 pt-1">
          <div className="rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            <a
              href={`${base}?filtro=aprovadas`}
              onClick={() => setAberto(false)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <span className="font-medium">Somente aprovadas</span>
              <span className="block text-xs text-zinc-500">
                {linhasAprovadas} {linhasAprovadas === 1 ? "item" : "itens"} — o que virou compra
              </span>
            </a>
            <a
              href={base}
              onClick={() => setAberto(false)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <span className="font-medium">Solicitação inteira</span>
              <span className="block text-xs text-zinc-500">
                {totalLinhas} {totalLinhas === 1 ? "item" : "itens"} — inclui recusadas e pendentes
              </span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
