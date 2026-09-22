"use client";

import { useState } from "react";
import { urlFotoItem } from "@/lib/foto-item";

/**
 * Miniatura da foto do item, clicável para ver grande.
 *
 * Usada nas listas de conferência (solicitação, contagem): quem confere nem
 * sempre reconhece o item pelo nome do cadastro, e abrir outra tela pra ver a
 * foto faria perder o lugar na lista.
 */
export function FotoProduto({
  fotoPath,
  nome,
  tamanho = 28,
}: {
  fotoPath: string | null;
  nome: string;
  tamanho?: number;
}) {
  const [aberta, setAberta] = useState(false);
  const url = urlFotoItem(fotoPath);
  if (!url) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        title={`Ver foto de ${nome}`}
        className="shrink-0 rounded border border-zinc-200 transition hover:ring-2 hover:ring-zinc-300 print:hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          width={tamanho}
          height={tamanho}
          className="rounded object-cover"
          style={{ width: tamanho, height: tamanho }}
        />
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-label={`Foto de ${nome}`}
          onClick={() => setAberta(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            className="flex max-h-full max-w-lg flex-col gap-2 rounded-lg bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-zinc-900">{nome}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-h-[70vh] rounded object-contain" />
            <button
              type="button"
              onClick={() => setAberta(false)}
              className="self-end rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
