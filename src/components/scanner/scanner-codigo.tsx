"use client";

/**
 * Scanner de código de barras (Code 128 e formatos comuns) via html5-qrcode.
 *
 * Recebe onCodigo(codigo: string) e chama quando detectar um código.
 * O componente abre câmera traseira, mostra o viewfinder e os controles.
 *
 * IMPORTANTE: o pacote html5-qrcode precisa do DOM, então é "use client"
 * e fazemos import dinâmico pra evitar quebrar SSR.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onCodigo: (codigo: string) => void;
  /** Texto exibido no botão de iniciar. Default: "📷 Escanear código". */
  labelIniciar?: string;
  /** Continua escaneando depois de cada leitura? Default: false (para após o primeiro). */
  continuo?: boolean;
};

const ELEMENT_ID = "scanner-codigo-region";

export function ScannerCodigo({ onCodigo, labelIniciar = "📷 Escanear código", continuo = false }: Props) {
  const [ativo, setAtivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const scannerRef = useRef<unknown>(null);
  const ultimoCodigo = useRef<string | null>(null);
  const ultimoCodigoAt = useRef<number>(0);

  // Limpeza ao desmontar
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
    // 1) Marca como ativo ANTES de chamar start — o elemento DOM precisa estar
    //    renderizado e com dimensões pra o html5-qrcode anexar o <video>.
    setAtivo(true);
    // Pequeno delay pra garantir o React commitar o re-render
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const mod = await import("html5-qrcode");
      const { Html5Qrcode } = mod;
      const scanner = new Html5Qrcode(ELEMENT_ID, {
        verbose: false,
        // formatos suportados (Code 128 é o do Queóps; mantém QR e EAN por flexibilidade)
        formatsToSupport: [
          mod.Html5QrcodeSupportedFormats.CODE_128,
          mod.Html5QrcodeSupportedFormats.CODE_39,
          mod.Html5QrcodeSupportedFormats.EAN_13,
          mod.Html5QrcodeSupportedFormats.QR_CODE,
        ],
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          // Debounce: ignora repetições do mesmo código por 1.5s
          const agora = Date.now();
          if (ultimoCodigo.current === decodedText && agora - ultimoCodigoAt.current < 1500) {
            return;
          }
          ultimoCodigo.current = decodedText;
          ultimoCodigoAt.current = agora;
          onCodigo(decodedText.trim());
          if (!continuo) {
            // Para o scanner depois da primeira leitura
            scanner
              .stop()
              .then(() => scanner.clear())
              .catch(() => undefined);
            setAtivo(false);
          }
        },
        () => {
          // erro de leitura por frame — ignora silenciosamente
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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
  };

  return (
    <div className="flex flex-col gap-2">
      {/* O elemento precisa estar SEMPRE no DOM com largura útil pra o html5-qrcode
          conseguir anexar o <video>. Quando inativo, escondo via height=0 + opacity,
          NÃO via display:none ou hidden. */}
      <div
        id={ELEMENT_ID}
        className="w-full overflow-hidden rounded-md bg-black"
        style={{
          minHeight: ativo ? 240 : 0,
          height: ativo ? "auto" : 0,
          border: ativo ? "1px solid rgb(212 212 216)" : "none",
          opacity: ativo ? 1 : 0,
        }}
      />
      <div className="flex items-center gap-2">
        {!ativo ? (
          <Button type="button" onClick={iniciar}>
            {labelIniciar}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={parar}>
            ✕ Parar scanner
          </Button>
        )}
        {ativo && (
          <span className="text-xs text-zinc-500">Aponta a câmera pro código de barras.</span>
        )}
      </div>
      {erro && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          ⚠ {erro}
        </div>
      )}
    </div>
  );
}
