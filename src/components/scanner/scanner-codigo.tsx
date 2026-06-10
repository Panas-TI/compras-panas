"use client";

/**
 * Scanner de código de barras (Code 128 e formatos comuns) via html5-qrcode.
 *
 * Otimizado pra códigos pequenos do Queóps:
 * - qrbox grande (~90% da largura) pra dar área de leitura ampla
 * - fps 24 pra mais leituras por segundo
 * - resolução alta (1920x1080 ideal)
 * - slider de zoom 1x-5x quando o dispositivo suporta
 * - botão de flash (torch) quando o dispositivo suporta
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onCodigo: (codigo: string) => void;
  labelIniciar?: string;
  continuo?: boolean;
};

const ELEMENT_ID = "scanner-codigo-region";

type ZoomTrackCapabilities = {
  zoom?: { min: number; max: number; step: number };
  torch?: boolean;
};

export function ScannerCodigo({ onCodigo, labelIniciar = "📷 Escanear código", continuo = false }: Props) {
  const [ativo, setAtivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [torchSuportado, setTorchSuportado] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const scannerRef = useRef<unknown>(null);
  const ultimoCodigo = useRef<string | null>(null);
  const ultimoCodigoAt = useRef<number>(0);

  useEffect(() => {
    return () => {
      const s = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
      if (s?.stop) {
        s.stop()
          .then(() => s.clear?.())
          .catch(() => undefined);
      }
    };
  }, []);

  const iniciar = async () => {
    setErro(null);
    setAtivo(true);
    // Garante que o elemento DOM já tem dimensões antes do scanner anexar o <video>
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const mod = await import("html5-qrcode");
      const { Html5Qrcode } = mod;
      const scanner = new Html5Qrcode(ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          mod.Html5QrcodeSupportedFormats.CODE_128,
          mod.Html5QrcodeSupportedFormats.CODE_39,
          mod.Html5QrcodeSupportedFormats.CODE_93,
          mod.Html5QrcodeSupportedFormats.EAN_13,
          mod.Html5QrcodeSupportedFormats.EAN_8,
          mod.Html5QrcodeSupportedFormats.UPC_A,
          mod.Html5QrcodeSupportedFormats.UPC_E,
          mod.Html5QrcodeSupportedFormats.ITF,
          mod.Html5QrcodeSupportedFormats.QR_CODE,
          mod.Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
      });
      scannerRef.current = scanner;

      await scanner.start(
        {
          facingMode: { exact: "environment" },
        } as MediaTrackConstraints,
        {
          fps: 24,
          // qrbox dinâmico: ocupa ~90% da largura, altura proporcional pra Code 128 (horizontal)
          qrbox: (viewW: number, viewH: number) => {
            const w = Math.floor(Math.min(viewW * 0.9, 480));
            const h = Math.floor(Math.min(viewH * 0.55, 260));
            return { width: w, height: h };
          },
          aspectRatio: 1.333,
          videoConstraints: {
            facingMode: { exact: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        (decodedText) => {
          const agora = Date.now();
          if (ultimoCodigo.current === decodedText && agora - ultimoCodigoAt.current < 1500) {
            return;
          }
          ultimoCodigo.current = decodedText;
          ultimoCodigoAt.current = agora;
          onCodigo(decodedText.trim());
          if (!continuo) {
            scanner
              .stop()
              .then(() => scanner.clear())
              .catch(() => undefined);
            setAtivo(false);
          }
        },
        () => {
          // erro por frame — ignora
        }
      );

      // Tenta detectar capabilities (zoom/torch) do dispositivo
      try {
        const videoEl = document.querySelector(`#${ELEMENT_ID} video`) as HTMLVideoElement | null;
        const stream = videoEl?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks?.()[0];
        if (track) {
          const caps = track.getCapabilities?.() as ZoomTrackCapabilities | undefined;
          if (caps?.zoom) {
            setZoomCap({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step });
            setZoom(caps.zoom.min);
          }
          if (caps?.torch) {
            setTorchSuportado(true);
          }
        }
      } catch {
        // ignora — sem zoom/torch é OK
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Se câmera traseira exigida falhou, tenta de novo sem o exact
      if (msg.toLowerCase().includes("overconstrained") || msg.toLowerCase().includes("notreadable")) {
        try {
          const mod = await import("html5-qrcode");
          const { Html5Qrcode } = mod;
          const scanner = new Html5Qrcode(ELEMENT_ID, { verbose: false });
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "environment" },
            { fps: 24, qrbox: { width: 320, height: 200 } },
            (decoded) => {
              onCodigo(decoded.trim());
              if (!continuo) {
                scanner.stop().then(() => scanner.clear()).catch(() => undefined);
                setAtivo(false);
              }
            },
            () => undefined
          );
          return;
        } catch (e2) {
          setErro(e2 instanceof Error ? e2.message : String(e2));
          setAtivo(false);
          return;
        }
      }
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setErro("Permissão da câmera negada. Libera nas configurações do navegador.");
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
        setErro("Nenhuma câmera detectada nesse dispositivo.");
      } else {
        setErro(msg);
      }
      setAtivo(false);
    }
  };

  const parar = async () => {
    const s = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (s?.stop) {
      await s.stop().catch(() => undefined);
      s.clear?.();
    }
    setAtivo(false);
    setTorchOn(false);
    setZoomCap(null);
    setZoom(1);
    setTorchSuportado(false);
  };

  const aplicarZoom = async (v: number) => {
    setZoom(v);
    try {
      const videoEl = document.querySelector(`#${ELEMENT_ID} video`) as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track?.applyConstraints({ advanced: [{ zoom: v } as any] });
    } catch {
      // ignora
    }
  };

  const toggleTorch = async () => {
    const novo = !torchOn;
    setTorchOn(novo);
    try {
      const videoEl = document.querySelector(`#${ELEMENT_ID} video`) as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track?.applyConstraints({ advanced: [{ torch: novo } as any] });
    } catch {
      setTorchOn(!novo);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Container do vídeo: sempre no DOM com largura útil pra o html5-qrcode anexar o <video>.
          Quando inativo, escondo via height=0 + opacity=0 (NÃO display:none). */}
      <div
        id={ELEMENT_ID}
        className="relative w-full overflow-hidden rounded-md bg-black"
        style={{
          minHeight: ativo ? 280 : 0,
          height: ativo ? "auto" : 0,
          border: ativo ? "1px solid rgb(212 212 216)" : "none",
          opacity: ativo ? 1 : 0,
        }}
      />

      {/* Controles ativos durante o scan */}
      {ativo && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <Button type="button" variant="outline" size="sm" onClick={parar}>
            ✕ Parar
          </Button>
          {torchSuportado && (
            <Button type="button" variant="outline" size="sm" onClick={toggleTorch}>
              {torchOn ? "💡 Apagar luz" : "🔦 Ligar luz"}
            </Button>
          )}
          {zoomCap && zoomCap.max > zoomCap.min && (
            <div className="flex flex-1 items-center gap-2 text-xs">
              <span className="font-medium text-zinc-600">Zoom {zoom.toFixed(1)}x</span>
              <input
                type="range"
                min={zoomCap.min}
                max={zoomCap.max}
                step={zoomCap.step || 0.1}
                value={zoom}
                onChange={(e) => aplicarZoom(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          )}
        </div>
      )}

      {/* Botão pra iniciar */}
      {!ativo && (
        <Button type="button" onClick={iniciar}>
          {labelIniciar}
        </Button>
      )}

      {ativo && (
        <p className="text-xs text-zinc-500">
          📌 Aproxima a câmera bastante do código. Se estiver pequeno, usa o zoom. Em ambiente escuro, liga a
          luz.
        </p>
      )}

      {erro && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          ⚠ {erro}
        </div>
      )}
    </div>
  );
}
