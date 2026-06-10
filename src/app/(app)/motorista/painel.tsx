"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScannerCodigo } from "@/components/scanner/scanner-codigo";

// IMPORTANTE: usamos rotas HTTP (route handlers) em vez de Server Actions
// porque Server Actions estavam crashando o iOS Safari ('This page couldn't load')
// logo após a bipada — provavelmente conflito do protocolo RSC com transition
// de estado durante render. Fetch normal é mais robusto.

export type GpsCapturado = {
  lat: number;
  lng: number;
  precisao_metros: number;
} | null;

type ValidarResp =
  | { ok: true; entregaId: string; codigo: string }
  | {
      ok: false;
      reason: "nao_encontrado" | "outro_motorista" | "outro_dia" | "ja_entregue" | "erro";
      message: string;
    };

type ConcluirResp =
  | { ok: true; entregaId: string }
  | { ok: false; error: string };

type Entrega = {
  id: string;
  codigo_queops: string;
  status: string;
  hora_entrega: string | null;
  cliente_nome: string | null;
  bairro: string | null;
  entregue_at: string | null;
};

type Feedback = {
  tipo: "ok" | "warn" | "erro";
  titulo: string;
  detalhe?: string;
  ts: number;
};

type FotoCapturada = {
  base64: string;
  mediaType: "image/jpeg";
  previewUrl: string;
  sizeKB: number;
};

type Etapa =
  | { tipo: "scan" }
  | { tipo: "foto"; entregaId: string; codigo: string; gps: GpsCapturado };

function captureGps(timeoutMs = 8000): Promise<GpsCapturado> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let resolved = false;
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(t);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao_metros: pos.coords.accuracy ?? 0,
        });
      },
      () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(t);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

// DEBUG: log persistente entre reloads (localStorage) pra rastrear crash
function debugLog(msg: string) {
  if (typeof window === "undefined") return;
  try {
    const prev = localStorage.getItem("__entrega_debug__") ?? "";
    const stamp = new Date().toLocaleTimeString("pt-BR", { hour12: false }) +
      "." + String(Date.now() % 1000).padStart(3, "0");
    const novo = `${stamp} ${msg}\n${prev}`.slice(0, 4000);
    localStorage.setItem("__entrega_debug__", novo);
  } catch {
    // ignora
  }
}

export function Painel({
  nome,
  data,
  pendentes,
  entregues,
  role,
}: {
  nome: string;
  data: string;
  pendentes: Entrega[];
  entregues: Entrega[];
  role: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "scan" });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [foto, setFoto] = useState<FotoCapturada | null>(null);
  const [validando, startValidar] = useTransition();
  const [concluindo, startConcluir] = useTransition();
  const [manual, setManual] = useState("");
  const [debugAberto, setDebugAberto] = useState(false);

  const dataBR = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
  const debugTxt = typeof window !== "undefined" ? localStorage.getItem("__entrega_debug__") ?? "" : "";

  const onCodigo = (codigo: string) => {
    debugLog(`onCodigo bipou: ${codigo}`);
    setFeedback({ tipo: "ok", titulo: "Validando…", detalhe: codigo, ts: Date.now() });
    startValidar(async () => {
      try {
        debugLog("fetch /api/motorista/validar START");
        // PASSO 1: valida via route handler HTTP (não Server Action)
        const r = await fetch("/api/motorista/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
        debugLog(`fetch validar resposta ${r.status} ok=${r.ok}`);
        // Lê como texto primeiro — se servidor retorna HTML de erro,
        // r.json() crasha com "string did not match expected pattern" no iOS.
        const raw = await r.text();
        let validacao: ValidarResp;
        try {
          validacao = JSON.parse(raw) as ValidarResp;
        } catch {
          setFeedback({
            tipo: "erro",
            titulo: `Resposta inválida do servidor (HTTP ${r.status})`,
            detalhe: raw.slice(0, 300),
            ts: Date.now(),
          });
          return;
        }
        if (!validacao.ok) {
          const t: Record<typeof validacao.reason, "warn" | "erro"> = {
            nao_encontrado: "erro",
            outro_motorista: "warn",
            outro_dia: "warn",
            ja_entregue: "warn",
            erro: "erro",
          };
          setFeedback({
            tipo: t[validacao.reason],
            titulo: validacao.message,
            detalhe: `Código lido: ${codigo}`,
            ts: Date.now(),
          });
          return;
        }

        debugLog(`validacao OK entregaId=${validacao.entregaId}`);
        // DEBUG: pulando GPS temporariamente pra isolar se ele é a causa do crash
        setEtapa({ tipo: "foto", entregaId: validacao.entregaId, codigo: validacao.codigo, gps: null });
        setFeedback({
          tipo: "ok",
          titulo: "Pronto pra foto",
          detalhe: `${validacao.codigo} (GPS desativado temporariamente pra debug)`,
          ts: Date.now(),
        });
        debugLog("setEtapa foto OK");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debugLog(`onCodigo catch: ${msg}`);
        setFeedback({
          tipo: "erro",
          titulo: "Erro inesperado",
          detalhe: msg,
          ts: Date.now(),
        });
      }
    });
  };

  const lancarManual = () => {
    if (!manual.trim()) return;
    onCodigo(manual.trim());
    setManual("");
  };

  const handleFotoFile = async (file: File) => {
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
      setFeedback({ tipo: "erro", titulo: "Erro ao processar foto", detalhe: String(e), ts: Date.now() });
    }
  };

  const cancelarFoto = () => {
    setFoto(null);
    setEtapa({ tipo: "scan" });
    if (fileRef.current) fileRef.current.value = "";
  };

  const concluir = () => {
    if (etapa.tipo !== "foto" || !foto) return;
    startConcluir(async () => {
      try {
        const r = await fetch("/api/motorista/concluir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entregaId: etapa.entregaId,
            fotoBase64: foto.base64,
            mediaType: foto.mediaType,
            gps: etapa.gps,
          }),
        });
        const raw = await r.text();
        let res: ConcluirResp;
        try {
          res = JSON.parse(raw) as ConcluirResp;
        } catch {
          setFeedback({
            tipo: "erro",
            titulo: `Resposta inválida do servidor (HTTP ${r.status})`,
            detalhe: raw.slice(0, 300),
            ts: Date.now(),
          });
          return;
        }
        if (!res.ok) {
          setFeedback({ tipo: "erro", titulo: res.error, ts: Date.now() });
          return;
        }
        setFeedback({
          tipo: "ok",
          titulo: "✓ Entregue!",
          detalhe: etapa.codigo,
          ts: Date.now(),
        });
        setFoto(null);
        setEtapa({ tipo: "scan" });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (e) {
        setFeedback({
          tipo: "erro",
          titulo: "Erro ao concluir",
          detalhe: e instanceof Error ? e.message : String(e),
          ts: Date.now(),
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {nome}!</h1>
        <p className="text-sm text-zinc-600">
          {dataBR} · {pendentes.length} {pendentes.length === 1 ? "entrega pendente" : "entregas pendentes"}
          {entregues.length > 0 && ` · ${entregues.length} já entregue(s)`}
        </p>
        {role === "aprovador" && (
          <p className="mt-1 text-xs text-amber-700">
            Você está visualizando como motorista.
          </p>
        )}
        {debugTxt && (
          <button
            type="button"
            onClick={() => setDebugAberto((v) => !v)}
            className="mt-1 text-xs text-zinc-500 underline"
          >
            {debugAberto ? "Esconder" : "Ver"} log de debug ({debugTxt.split("\n").length} eventos)
          </button>
        )}
        {debugAberto && (
          <div className="mt-2 rounded-md border border-zinc-300 bg-white p-2">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-700">
              {debugTxt}
            </pre>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("__entrega_debug__");
                setDebugAberto(false);
                router.refresh();
              }}
              className="mt-2 text-xs text-red-600 underline"
            >
              Limpar log
            </button>
          </div>
        )}
      </div>

      {/* === ETAPA SCAN === */}
      {etapa.tipo === "scan" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div>
              <p className="text-sm font-medium">1. Bipa o código do pedido entregue</p>
              <p className="text-xs text-zinc-500">
                Aponta a câmera no código de barras. O GPS é capturado em paralelo.
              </p>
            </div>
            <ScannerCodigo onCodigo={onCodigo} labelIniciar="📷 Bipar código" />
            <div className="flex items-end gap-2 border-t border-zinc-100 pt-3">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="manual" className="text-xs font-medium text-zinc-600">
                  Ou digita o código
                </label>
                <input
                  id="manual"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") lancarManual();
                  }}
                  placeholder="C010022310554"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={lancarManual}
                disabled={validando || !manual.trim()}
              >
                Validar
              </Button>
            </div>
            {validando && (
              <div className="text-xs text-zinc-500">Validando pedido + capturando GPS…</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* === ETAPA FOTO === */}
      {etapa.tipo === "foto" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              ✓ Pedido <span className="font-mono">{etapa.codigo}</span> validado.
              {etapa.gps && (
                <span className="text-xs text-emerald-700"> GPS capturado (~{Math.round(etapa.gps.precisao_metros)}m).</span>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">2. Tira foto do canhoto / nota assinada</p>
              <p className="text-xs text-zinc-500">
                Obrigatório pro financeiro. A foto fica anexada ao pedido.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFotoFile(f);
              }}
            />

            {!foto ? (
              <Button type="button" onClick={() => fileRef.current?.click()} className="h-14 text-base">
                📷 Tirar foto do canhoto
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
                  <span>{foto.sizeKB} KB · comprimida</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFoto(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    disabled={concluindo}
                  >
                    Trocar foto
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t border-zinc-100 pt-3">
              <Button type="button" variant="outline" onClick={cancelarFoto} disabled={concluindo}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={concluir}
                disabled={concluindo || !foto}
                className="flex-1"
              >
                {concluindo ? "Enviando…" : "✓ Confirmar entrega"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {feedback && (
        <div
          className={`rounded-md border-2 px-4 py-3 text-base ${
            feedback.tipo === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : feedback.tipo === "warn"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <div className="font-semibold">{feedback.titulo}</div>
          {feedback.detalhe && <div className="font-mono text-sm">{feedback.detalhe}</div>}
        </div>
      )}

      {etapa.tipo === "scan" && (
        <>
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">
              Pendentes ({pendentes.length})
            </h2>
            {pendentes.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-zinc-500">
                  Nada pendente. Bom trabalho!
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {pendentes.map((e) => (
                  <Card key={e.id}>
                    <CardContent className="flex flex-col gap-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          {e.status === "em_rota" ? "EM ROTA" : "PENDENTE"}
                        </span>
                        <span className="font-mono text-sm">{e.codigo_queops}</span>
                      </div>
                      {(e.cliente_nome || e.bairro || e.hora_entrega) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700">
                          {e.hora_entrega && <span>⏰ {e.hora_entrega.slice(0, 5)}</span>}
                          {e.cliente_nome && <span>{e.cliente_nome}</span>}
                          {e.bairro && <span className="text-zinc-500">{e.bairro}</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {entregues.length > 0 && (
            <details className="rounded-md border border-zinc-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-700">
                Entregues hoje ({entregues.length})
              </summary>
              <ul className="divide-y divide-zinc-100">
                {entregues.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                        ✓
                      </span>
                      <span className="font-mono">{e.codigo_queops}</span>
                      {e.cliente_nome && <span className="text-zinc-600">{e.cliente_nome}</span>}
                    </div>
                    {e.entregue_at && (
                      <span className="text-xs text-zinc-500">
                        {new Date(e.entregue_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
