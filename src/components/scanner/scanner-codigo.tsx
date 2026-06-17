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
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
};

export function ScannerCodigo({ onCodigo, labelIniciar = "📷 Escanear código", continuo = false }: Props) {
  const [ativo, setAtivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [torchSuportado, setTorchSuportado] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [decodingFoto, setDecodingFoto] = useState(false);
  const [decodingStage, setDecodingStage] = useState<string | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [modoManual, setModoManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");
  const [camadaUsada, setCamadaUsada] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scannerRef = useRef<unknown>(null);
  const ultimoCodigo = useRef<string | null>(null);
  const ultimoCodigoAt = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const detectorNativoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      if (detectorNativoIntervalRef.current) {
        clearInterval(detectorNativoIntervalRef.current);
        detectorNativoIntervalRef.current = null;
      }
      const s = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
      if (s?.stop) {
        s.stop()
          .then(() => s.clear?.())
          .catch(() => undefined);
      }
    };
  }, []);

  // Handler único de leitura aceita — usado tanto pelo html5-qrcode quanto pelo
  // BarcodeDetector nativo (rodando em paralelo no mesmo streaming).
  const aceitarCodigo = (
    decodedText: string,
    scanner: { stop: () => Promise<void>; clear: () => void }
  ) => {
    const agora = Date.now();
    const codigoTrim = decodedText.trim();

    // Debounce do código JÁ ACEITO: não reaceitar o mesmo nos próximos 3s
    if (ultimoCodigo.current === codigoTrim && agora - ultimoCodigoAt.current < 3000) {
      return;
    }

    // Rejeita códigos muito curtos (falso positivo de ruído)
    if (codigoTrim.length < 4) {
      return;
    }

    ultimoCodigo.current = codigoTrim;
    ultimoCodigoAt.current = agora;
    sinalLeitura(codigoTrim);

    // Para o detector nativo paralelo
    if (detectorNativoIntervalRef.current) {
      clearInterval(detectorNativoIntervalRef.current);
      detectorNativoIntervalRef.current = null;
    }

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
  };

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
            // Resolução alta (1920x1080) com fallback automático do browser pra menor
            // se o sensor não suportar. Em Motorola/Samsung baratos, mais pixels =
            // código de barras pequeno mais nítido.
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            // Modos contínuos: foco, exposição, white balance. Críticos em câmeras
            // ruins de Android baratos que por padrão ficam embaçadas/mal expostas.
            advanced: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { focusMode: "continuous" } as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { exposureMode: "continuous" } as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { whiteBalanceMode: "continuous" } as any,
            ],
          },
        },
        (decodedText) => aceitarCodigo(decodedText, scanner),
        () => {
          // erro por frame — ignora
        }
      );

      // === LOOP PARALELO com BarcodeDetector NATIVO do sistema operacional ===
      // Quando disponível (Android Chrome, iOS 17+, Edge), é MUITO mais preciso
      // que o ZXing JS — usa o decoder profissional do SO. Roda em paralelo ao
      // html5-qrcode; o primeiro que ler vence.
      type BarcodeDetectorAPI = {
        new (options?: { formats?: string[] }): {
          detect: (img: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
        };
        getSupportedFormats?: () => Promise<string[]>;
      };
      const w = window as unknown as { BarcodeDetector?: BarcodeDetectorAPI };
      if (w.BarcodeDetector) {
        try {
          const supported = (await w.BarcodeDetector.getSupportedFormats?.()) ?? [];
          const desejados = [
            "code_128",
            "qr_code",
            "code_39",
            "code_93",
            "ean_13",
            "ean_8",
            "itf",
            "codabar",
            "data_matrix",
          ];
          const formats = desejados.filter((f) => supported.includes(f));
          const detector = new w.BarcodeDetector(
            formats.length ? { formats } : undefined
          );
          detectorNativoIntervalRef.current = setInterval(async () => {
            try {
              const videoEl = document.querySelector(
                `#${ELEMENT_ID} video`
              ) as HTMLVideoElement | null;
              if (!videoEl || videoEl.readyState < 2) return;
              const results = await detector.detect(videoEl);
              const primeiro = results.find((r) => r.rawValue?.trim());
              if (primeiro) {
                aceitarCodigo(primeiro.rawValue, scanner);
              }
            } catch {
              // ignora frame com erro
            }
          }, 200); // 5 detecções por segundo — leve, sem competir com o html5-qrcode
        } catch {
          // ignora — sem BarcodeDetector é OK
        }
      }

      // Tenta detectar capabilities (zoom/torch) do dispositivo
      try {
        const videoEl = document.querySelector(`#${ELEMENT_ID} video`) as HTMLVideoElement | null;
        const stream = videoEl?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks?.()[0];
        if (track) {
          const caps = track.getCapabilities?.() as ZoomTrackCapabilities | undefined;
          if (caps?.zoom) {
            setZoomCap({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step });
            // Inicia em 2x (ou no máx disponível) — câmera ruim foca MUITO melhor
            // em close. Usuário pode reduzir no slider se quiser.
            const zoomInicial = Math.min(2, caps.zoom.max);
            setZoom(zoomInicial);
            try {
              await track.applyConstraints({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                advanced: [{ zoom: zoomInicial } as any],
              });
            } catch {
              // ignora
            }
          }
          if (caps?.torch) {
            setTorchSuportado(true);
          }
          // Força foco contínuo se suportado (algumas câmeras só aplicam via applyConstraints,
          // não via videoConstraints iniciais).
          if (caps?.focusMode?.includes("continuous")) {
            try {
              await track.applyConstraints({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                advanced: [{ focusMode: "continuous" } as any],
              });
            } catch {
              // ignora
            }
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
    if (detectorNativoIntervalRef.current) {
      clearInterval(detectorNativoIntervalRef.current);
      detectorNativoIntervalRef.current = null;
    }
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

  // === Pré-processamento da imagem ===
  // Carrega o file em canvas e aplica:
  //  1. Escala de cinza ponderada (luminance)
  //  2. Binarização adaptativa via threshold de Otsu (calcula o limiar ótimo
  //     que maximiza a variância entre classes — funciona muito bem em fotos
  //     mal expostas porque se adapta ao histograma de cada imagem)
  // Retorna um novo Blob PNG com a imagem processada.
  // Códigos de barras "borrados" ficam decodáveis após binarização.
  const preProcessarImagem = async (file: File): Promise<Blob | null> => {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();

      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img.data;
      // Escala de cinza
      const cinza = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        cinza[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      }
      // Otsu threshold
      const hist = new Array(256).fill(0);
      for (let i = 0; i < cinza.length; i++) hist[cinza[i]]++;
      const total = cinza.length;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, max = 0, threshold = 127;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) ** 2;
        if (between > max) { max = between; threshold = t; }
      }
      // Aplica binarização (preto/branco puro)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const v = cinza[j] > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
      return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    } catch {
      return null;
    }
  };

  // === Tentar BarcodeDetector nativo (Android Chrome, iOS 17+ Safari, Edge) ===
  // É o decoder do PRÓPRIO sistema operacional — muito mais preciso que ZXing JS.
  // Suporta Code 128 alfanumérico (ex: C020022310668), QR, EAN, Code 39 etc.
  // Retorna null se a API não existe ou se não achou nada.
  const tentarDecoderNativo = async (
    source: ImageBitmapSource
  ): Promise<string | null> => {
    type BarcodeDetectorAPI = {
      new (options?: { formats?: string[] }): {
        detect: (img: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
      };
      getSupportedFormats?: () => Promise<string[]>;
    };
    const w = window as unknown as { BarcodeDetector?: BarcodeDetectorAPI };
    if (!w.BarcodeDetector) return null;
    try {
      const supported = (await w.BarcodeDetector.getSupportedFormats?.()) ?? [];
      const desejados = [
        "code_128",
        "qr_code",
        "code_39",
        "code_93",
        "ean_13",
        "ean_8",
        "itf",
        "codabar",
        "data_matrix",
      ];
      const formats = desejados.filter((f) => supported.includes(f));
      const detector = new w.BarcodeDetector(formats.length ? { formats } : undefined);
      const results = await detector.detect(source);
      const primeiro = results.find((r) => r.rawValue?.trim());
      return primeiro?.rawValue.trim() ?? null;
    } catch {
      return null;
    }
  };

  // === OCR via Tesseract.js (camada DEFINITIVA) ===
  // Lê o TEXTO impresso embaixo do código de barras (ex: "C020022310668")
  // que sempre é legível mesmo quando as barras estão borradas demais pros
  // decoders. 100% client-side, sem chave de API, sem dado saindo da rede.
  // Pacote ~3MB baixado uma vez e cacheado pelo browser.
  const tentarOcrTexto = async (file: File | Blob): Promise<string | null> => {
    try {
      const mod = await import("tesseract.js");
      const { recognize } = mod;
      const { data } = await recognize(file, "eng", {
        // Whitelist: só caracteres que aparecem em código Queóps (letras maiúsculas
        // + dígitos). Reduz drasticamente confusão tipo O/0, I/1, S/5.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      } as Parameters<typeof recognize>[2]);

      const texto = data.text ?? "";
      // Extrai candidatos: tokens com 8+ caracteres alfanuméricos.
      // Códigos Queóps têm padrão LETRA + 10-15 dígitos (ex: C020022310668).
      // Pego o primeiro que casar o padrão estrito, senão o primeiro alfanumérico longo.
      const linhas = texto
        .split(/[\s\n\r|]+/)
        .map((s) => s.replace(/[^A-Z0-9]/g, "").trim())
        .filter((s) => s.length >= 8);

      // Padrão preferido: 1 letra + 10-15 dígitos
      const padraoEstrito = /^[A-Z]\d{10,15}$/;
      const matchEstrito = linhas.find((s) => padraoEstrito.test(s));
      if (matchEstrito) return matchEstrito;

      // Padrão relaxado: 8+ alfanuméricos
      const matchRelaxado = linhas.find((s) => /^[A-Z0-9]{8,20}$/.test(s));
      return matchRelaxado ?? null;
    } catch {
      return null;
    }
  };

  // === FALLBACK: tirar foto via câmera nativa ===
  // 5 camadas em sequência, do mais barato/rápido pro mais caro/lento:
  //   1. BarcodeDetector nativo na imagem original
  //   2. html5-qrcode (ZXing JS) na imagem original
  //   3. BarcodeDetector nativo na imagem pré-processada (binarizada Otsu)
  //   4. html5-qrcode na imagem pré-processada
  //   5. Tesseract.js OCR — lê o texto humano-legível abaixo das barras
  //
  // Para todas falharem é praticamente impossível: as primeiras 4 quebram em
  // foto borrada, mas o OCR lê texto desfocado que ainda esteja parcialmente
  // legível (que é o caso típico do recibo Queóps).
  const finalizarComCodigo = (codigo: string, camada: string) => {
    setCamadaUsada(camada);
    sinalLeitura(codigo);
    onCodigo(codigo);
  };

  const onFotoSelecionada = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecodingFoto(true);
    setErroFoto(null);
    setCamadaUsada(null);

    try {
      // === CAMADA 1: BarcodeDetector nativo, imagem original ===
      setDecodingStage("Decoder nativo do sistema...");
      try {
        const bitmap = await createImageBitmap(file);
        const codigo = await tentarDecoderNativo(bitmap);
        bitmap.close?.();
        if (codigo) {
          finalizarComCodigo(codigo, "📱 decoder nativo");
          return;
        }
      } catch {
        // segue
      }

      // === CAMADA 2: ZXing JS, imagem original ===
      setDecodingStage("Decoder JavaScript...");
      const mod = await import("html5-qrcode");
      const { Html5Qrcode } = mod;
      const formatos = [
        mod.Html5QrcodeSupportedFormats.CODE_128,
        mod.Html5QrcodeSupportedFormats.QR_CODE,
        mod.Html5QrcodeSupportedFormats.EAN_13,
        mod.Html5QrcodeSupportedFormats.EAN_8,
        mod.Html5QrcodeSupportedFormats.CODE_39,
        mod.Html5QrcodeSupportedFormats.CODE_93,
        mod.Html5QrcodeSupportedFormats.ITF,
        mod.Html5QrcodeSupportedFormats.CODABAR,
      ];
      try {
        const tempScanner = new Html5Qrcode(ELEMENT_ID, {
          verbose: false,
          formatsToSupport: formatos,
        });
        const result = await tempScanner.scanFile(file, false);
        finalizarComCodigo(result.trim(), "🔍 ZXing JS");
        return;
      } catch {
        // segue
      }

      // === CAMADA 3 & 4: pré-processamento Otsu + decoders novamente ===
      setDecodingStage("Pré-processando imagem (alto contraste)...");
      const blobProcessado = await preProcessarImagem(file);
      if (blobProcessado) {
        // CAMADA 3: BarcodeDetector na imagem binarizada
        try {
          const bitmap = await createImageBitmap(blobProcessado);
          const codigo = await tentarDecoderNativo(bitmap);
          bitmap.close?.();
          if (codigo) {
            finalizarComCodigo(codigo, "📱 nativo + binarização");
            return;
          }
        } catch {
          // segue
        }
        // CAMADA 4: ZXing na imagem binarizada
        try {
          const tempScanner2 = new Html5Qrcode(ELEMENT_ID, {
            verbose: false,
            formatsToSupport: formatos,
          });
          const fileProcessado = new File([blobProcessado], "processada.png", {
            type: "image/png",
          });
          const result = await tempScanner2.scanFile(fileProcessado, false);
          finalizarComCodigo(result.trim(), "🔍 ZXing + binarização");
          return;
        } catch {
          // segue
        }
      }

      // === CAMADA 5: OCR Tesseract.js — lê o texto embaixo do código ===
      setDecodingStage("Lendo via OCR (pode demorar uns segundos)...");
      const codigoOcr = await tentarOcrTexto(blobProcessado ?? file);
      if (codigoOcr) {
        finalizarComCodigo(codigoOcr, "👁 OCR (texto)");
        return;
      }

      // Todas as camadas falharam
      setErroFoto(
        "Não consegui ler o código nessa foto, nem pelas barras nem pelo texto. " +
          "Tira de novo enquadrando SÓ a etiqueta do código (recorta o resto), com boa luz e foco nítido. " +
          "Ou usa o botão 'Digitar código'."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroFoto(msg);
    } finally {
      setDecodingFoto(false);
      setDecodingStage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // === FALLBACK 2: digitar manualmente ===
  const confirmarManual = () => {
    const c = codigoManual.trim();
    if (!c) return;
    sinalLeitura(c);
    onCodigo(c);
    setCodigoManual("");
    setModoManual(false);
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

      {/* Botões pra iniciar — 3 opções pra cobrir qualquer câmera */}
      {!ativo && !modoManual && (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={iniciar} disabled={decodingFoto}>
            {labelIniciar}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={decodingFoto}
            >
              {decodingFoto ? "Lendo foto…" : "📸 Tirar foto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModoManual(true)}
              disabled={decodingFoto}
            >
              ⌨ Digitar código
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            <strong>Câmera ruim?</strong> Usa &quot;Tirar foto&quot; — abre o app de câmera nativo
            (foco muito melhor) e tenta 5 jeitos de ler (decoders + binarização + OCR de texto).
            Funciona em quase qualquer foto. Ou digita o número à mão.
          </p>
          {/* Progresso enquanto decodifica */}
          {decodingFoto && decodingStage && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                {decodingStage}
              </div>
            </div>
          )}
          {/* Diagnóstico: qual camada conseguiu ler */}
          {camadaUsada && !decodingFoto && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
              ✓ Lido via <strong>{camadaUsada}</strong>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFotoSelecionada}
            className="hidden"
          />
        </div>
      )}

      {/* Modo digitar manual */}
      {!ativo && modoManual && (
        <div className="flex flex-col gap-2 rounded-md border border-zinc-300 bg-zinc-50 p-3">
          <label className="text-sm font-medium" htmlFor="codigo-manual">
            Digite o código de barras
          </label>
          <input
            id="codigo-manual"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmarManual();
              }
            }}
            placeholder="Ex: C020022310668"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-base"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={confirmarManual}
              disabled={!codigoManual.trim()}
              className="flex-1"
            >
              ✓ Confirmar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModoManual(false);
                setCodigoManual("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
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

      {erroFoto && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {erroFoto}
        </div>
      )}
    </div>
  );
}
