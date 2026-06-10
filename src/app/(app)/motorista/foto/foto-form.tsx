"use client";

import { useRef, useState, useTransition } from "react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Gps = { lat: number; lng: number; precisao_metros: number } | null;

type Foto = {
  base64: string;
  mediaType: "image/jpeg";
  previewUrl: string;
  sizeKB: number;
};

type ConcluirResp =
  | { ok: true; entregaId: string }
  | { ok: false; error: string };

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
  const [salvando, startSalvar] = useTransition();

  const handleFile = async (file: File) => {
    setErro(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/jpeg",
        initialQuality: 0.8,
      });
      const buf = await compressed.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      setFoto({
        base64: btoa(bin),
        mediaType: "image/jpeg",
        previewUrl: URL.createObjectURL(compressed),
        sizeKB: Math.round(compressed.size / 1024),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const concluir = () => {
    if (!foto) return;
    setErro(null);
    startSalvar(async () => {
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
          setErro(`Resposta inválida (HTTP ${r.status}): ${raw.slice(0, 200)}`);
          return;
        }
        if (!res.ok) {
          setErro(res.error);
          return;
        }
        // Sucesso → volta pro painel via reload completo (estado limpo)
        window.location.assign("/motorista?entregue=" + encodeURIComponent(codigo));
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
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

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {!foto ? (
          <Button type="button" onClick={() => fileRef.current?.click()} className="h-16 text-base">
            📷 Tirar foto do pedido
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
