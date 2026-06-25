"use client";

import { useRef, useState, useTransition } from "react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adicionarPendente } from "@/lib/offline/db";

type Gps = { lat: number; lng: number; precisao_metros: number } | null;

type Foto = {
  blob: Blob;
  base64: string;
  mediaType: "image/jpeg";
  previewUrl: string;
  sizeKB: number;
};

type ConcluirResp =
  | { ok: true; entregaId: string }
  | { ok: false; error: string };

// Conversão eficiente pra base64 via FileReader (nativo). O loop char-a-char
// antigo (String.fromCharCode num Uint8Array de vários MB) travava celular
// fraco tipo Samsung A04. readAsDataURL roda em código nativo, sem montar
// string gigante na thread JS.
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const virgula = result.indexOf(",");
      resolve(virgula >= 0 ? result.slice(virgula + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler a imagem"));
    reader.readAsDataURL(blob);
  });
}

export function FotoForm({
  entregaId,
  codigo,
  gps,
}: {
  entregaId: string;
  codigo: string;
  gps: Gps;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [salvando, startSalvar] = useTransition();

  const handleFile = async (file: File) => {
    setErro(null);
    setProcessando(true);
    try {
      // Tenta comprimir. Em celular fraco (Samsung A04 e afins) o web worker
      // ou a memória podem falhar — então caímos em tentativas mais leves e,
      // no pior caso, usamos a foto original sem comprimir.
      let processado: Blob = file;
      try {
        processado = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: "image/jpeg",
          initialQuality: 0.8,
        });
      } catch {
        try {
          processado = await imageCompression(file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 1280,
            useWebWorker: false,
            fileType: "image/jpeg",
            initialQuality: 0.7,
          });
        } catch {
          // Desiste de comprimir — manda a foto original mesmo.
          processado = file;
        }
      }
      const base64 = await blobParaBase64(processado);
      setFoto({
        blob: processado,
        base64,
        mediaType: "image/jpeg",
        previewUrl: URL.createObjectURL(processado),
        sizeKB: Math.round(processado.size / 1024),
      });
    } catch (e) {
      setErro(
        "Não consegui processar a foto. Tenta tirar de novo. " +
          (e instanceof Error ? `(${e.message})` : "")
      );
    } finally {
      setProcessando(false);
    }
  };

  const salvarOffline = async (): Promise<void> => {
    if (!foto) return;
    await adicionarPendente({
      entregaId,
      codigo,
      fotoBlob: foto.blob,
      mediaType: foto.mediaType,
      gps,
    });
  };

  const concluir = () => {
    if (!foto) return;
    setErro(null);
    startSalvar(async () => {
      // Se já está offline, salva direto na fila sem nem tentar a rede
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await salvarOffline();
          window.location.assign("/motorista?offline=" + encodeURIComponent(codigo));
        } catch (e) {
          setErro(`Falha ao salvar offline: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }

      // Online: tenta enviar. Se falhar por rede, salva offline.
      try {
        const r = await fetch("/api/motorista/concluir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entregaId,
            fotoBase64: foto.base64,
            mediaType: foto.mediaType,
            gps,
          }),
        });
        const raw = await r.text();
        let res: ConcluirResp;
        try {
          res = JSON.parse(raw) as ConcluirResp;
        } catch {
          // Resposta não-JSON (HTML de erro): salva offline pra retry
          await salvarOffline();
          window.location.assign("/motorista?offline=" + encodeURIComponent(codigo));
          return;
        }
        if (!res.ok) {
          setErro(res.error);
          return;
        }
        // Sucesso → volta pro painel via reload completo (estado limpo)
        window.location.assign("/motorista?entregue=" + encodeURIComponent(codigo));
      } catch {
        // Network error (sem rede no momento, timeout, etc) → fila offline
        try {
          await salvarOffline();
          window.location.assign("/motorista?offline=" + encodeURIComponent(codigo));
        } catch (e2) {
          setErro(
            `Falha ao salvar offline: ${e2 instanceof Error ? e2.message : String(e2)}`
          );
        }
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          ✓ Pedido validado.
          {gps && (
            <span className="text-xs text-emerald-700">
              {" "}GPS capturado (~{Math.round(gps.precisao_metros)}m).
            </span>
          )}
          {!gps && (
            <span className="text-xs text-amber-700"> Sem GPS.</span>
          )}
        </div>

        {/* capture="environment" força a CÂMERA traseira direto, sem opção de
            galeria. Resolve o caso do Samsung A04 que abria só a galeria. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {!foto ? (
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={processando}
            className="h-16 text-base"
          >
            {processando ? "Processando foto…" : "📷 Tirar foto do pedido"}
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.previewUrl}
              alt="Canhoto"
              className="max-h-72 w-full rounded-md border border-zinc-200 object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
              <span>{foto.sizeKB} KB</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFoto(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                disabled={salvando}
              >
                Trocar foto
              </Button>
            </div>
          </div>
        )}

        {erro && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            ⚠ {erro}
          </div>
        )}

        <div className="flex gap-2 border-t border-zinc-100 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.assign("/motorista")}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={concluir}
            disabled={salvando || !foto}
            className="flex-1"
          >
            {salvando ? "Enviando…" : "✓ Confirmar entrega"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
