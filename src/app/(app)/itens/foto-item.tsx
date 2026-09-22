"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { urlFotoItem } from "@/lib/foto-item";
import { salvarFotoItemAction, removerFotoItemAction } from "./actions";

/** base64 pelo FileReader: nativo, não monta string char a char. */
function paraBase64(blob: Blob): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.onload = () => {
      const url = String(reader.result);
      const [cabecalho, dados] = url.split(",");
      const mediaType = cabecalho.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
      resolve({ base64: dados, mediaType });
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Foto do item no cadastro.
 *
 * Comprime antes de enviar: foto de celular chega com 4 a 8 MB e o bucket
 * aceita 5. Para reconhecer um produto, 1200px bastam — o que passa disso só
 * deixa a tela lenta e enche o armazenamento.
 */
export function FotoItem({
  itemId,
  fotoPath,
  podeEditar,
}: {
  itemId: string;
  fotoPath: string | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const url = urlFotoItem(fotoPath);

  const enviar = async (file: File) => {
    setErro(null);
    setPreparando(true);
    try {
      const comprimida = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
      });
      const { base64, mediaType } = await paraBase64(comprimida);
      setPreparando(false);
      startTransition(async () => {
        const r = await salvarFotoItemAction(itemId, base64, mediaType);
        if (r.error) setErro(r.error);
        else router.refresh();
      });
    } catch (e) {
      setPreparando(false);
      setErro(e instanceof Error ? e.message : "Não consegui preparar a imagem.");
    }
  };

  const ocupado = pendente || preparando;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-32 w-32 rounded-md border border-zinc-200 object-cover"
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-center text-xs text-zinc-400">
            sem foto
          </div>
        )}

        {podeEditar && (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviar(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
            >
              {preparando
                ? "Preparando..."
                : pendente
                  ? "Enviando..."
                  : url
                    ? "Trocar foto"
                    : "Adicionar foto"}
            </Button>
            {url && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={ocupado}
                onClick={() => {
                  setErro(null);
                  startTransition(async () => {
                    const r = await removerFotoItemAction(itemId);
                    if (r.error) setErro(r.error);
                    else router.refresh();
                  });
                }}
              >
                Remover
              </Button>
            )}
            <p className="max-w-[220px] text-xs text-zinc-500">
              JPG, PNG ou WEBP. A imagem é reduzida antes de subir.
            </p>
          </div>
        )}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
