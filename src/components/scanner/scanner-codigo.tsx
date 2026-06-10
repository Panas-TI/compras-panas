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
  // Buffer das últimas leituras (anti-falso-positivo INVISÍVEL):
  // pra aceitar, precisa ver o mesmo código em pelo menos 2 frames dentro de 400ms.
  // A 24 fps isso é ~10 frames, então leitura genuína passa instantâneo (~80ms).
  const leiturasRecentes = useRef<Array<{ codigo: string; ts: number }>>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [ultimaLeitura, setUltimaLeitura] = useState<string | null>(null);

  // Feedback: beep curto + vibração + banner persistente por 2s
  const sinalLeitura = (codigo: string) => {
    // Vibração (Android/Chrome mobile suportam; iOS Safari ignora silenciosamente)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([80, 40, 80]);
    }

    // Beep curto via Web Audio (~600Hz por 100ms)
    try {
      type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (Ctx) {
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch {
      // ignora — som é só feedback
    }

    setUltimaLeitura(codigo);
    setTimeout(() => setUltimaLeitura((u) => (u === codigo ? null : u)), 2200);
  };

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
      // SÓ Code 128 (formato do Queóps) e QR. Outros formatos (EAN/UPC/ITF)
      // estavam gerando falsos positivos em códigos parciais ou vizinhos.
      const scanner = new Html5Qrcode(ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          mod.Html5QrcodeSupportedFormats.CODE_128,
          mod.Html5QrcodeSupportedFormats.QR_CODE,
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
            // Reduzi resolução pra 1280x720 — em iPhones mais antigos a tab
            // crashava de memória com 1920x1080 + GPS + rede simultâneos.
            // 720p ainda dá nitidez sobrada pra ler Code 128.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        (decodedText) => {
          const agora = Date.now();
          const codigoTrim = decodedText.trim();

          // Debounce do código JÁ ACEITO: não reaceitar o mesmo nos próximos 3s
          if (ultimoCodigo.current === codigoTrim && agora - ultimoCodigoAt.current < 3000) {
            return;
          }

          // Anti-falso-positivo invisível: agrega ao buffer e exige >=2 leituras
          // do mesmo código nos últimos 400ms pra confirmar. Pra leitura genuína,
          // que vem em frames consecutivos (~42ms a 24fps), isso passa em ~80ms.
          const JANELA_MS = 400;
          const MIN_VEZES = 2;
          const buf = leiturasRecentes.current.filter((r) => agora - r.ts <= JANELA_MS);
          buf.push({ codigo: codigoTrim, ts: agora });
          const vezesIguais = buf.filter((r) => r.codigo === codigoTrim).length;
          leiturasRecentes.current = buf;

          if (vezesIguais < MIN_VEZES) {
            return; // ainda não confirmado — aguarda próximo frame
          }

          // Confirmado!
          leiturasRecentes.current = [];
          ultimoCodigo.current = codigoTrim;
          ultimoCodigoAt.current = agora;
          sinalLeitura(codigoTrim);
          if (!continuo) {
            // Para o scanner ANTES de notificar — libera a câmera/recursos antes
            // do código consumidor reagir. Importante no iOS Safari (memória
            // estourada com câmera ativa + GPS + render simultâneos crashava a tab).
            scanner
              .stop()
              .then(() => {
                scanner.clear();
                setAtivo(false);
                onCodigo(codigoTrim);
              })
              .catch(() => {
                setAtivo(false);
                onCodigo(codigoTrim);
              });
          } else {
            onCodigo(codigoTrim);
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
    leiturasRecentes.current = [];
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
      {/* Container do vídeo + overlay de feedback. O container precisa estar SEMPRE no DOM
          com largura útil pra o html5-qrcode anexar o <video>. Quando inativo, escondo via
          height=0 + opacity=0 (NÃO display:none). */}
      <div className="relative">
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
        {/* Overlay verde quando confirma um código */}
        {ativo && ultimaLeitura && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-emerald-500/85 px-4 text-center text-white">
            <div>
              <div className="text-4xl">✓</div>
              <div className="mt-2 text-lg font-bold tracking-wide uppercase">Código lido</div>
              <div className="mt-1 font-mono text-sm">{ultimaLeitura}</div>
            </div>
          </div>
        )}
      </div>

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
