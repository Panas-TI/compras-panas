"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScannerCodigo } from "@/components/scanner/scanner-codigo";
import { OfflineStatus } from "@/lib/offline/offline-status";
import { RegisterSW } from "@/lib/offline/register-sw";

// Usamos route handlers HTTP em vez de Server Actions (mais robusto no iOS Safari).

type ValidarResp =
  | { ok: true; entregaId: string; codigo: string }
  | {
      ok: false;
      reason: "nao_encontrado" | "outro_motorista" | "outro_dia" | "ja_entregue" | "erro";
      message: string;
    };

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

type Gps = { lat: number; lng: number; precisao_metros: number };

function captureGps(timeoutMs = 6000): Promise<Gps | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao_metros: pos.coords.accuracy ?? 0,
        });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [validando, startValidar] = useTransition();
  const [manual, setManual] = useState("");

  const dataBR = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

  // Toast de sucesso quando volta da rota de foto
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const entregue = p.get("entregue");
    const offline = p.get("offline");
    if (entregue) {
      setFeedback({
        tipo: "ok",
        titulo: "✓ Entregue!",
        detalhe: entregue,
        ts: Date.now(),
      });
      window.history.replaceState({}, "", "/motorista");
    } else if (offline) {
      setFeedback({
        tipo: "warn",
        titulo: "💾 Salvo offline",
        detalhe: `${offline} — vai sincronizar quando voltar a conexão`,
        ts: Date.now(),
      });
      window.history.replaceState({}, "", "/motorista");
    }
  }, []);

  const onCodigo = (codigo: string) => {
    setFeedback({ tipo: "ok", titulo: "Validando…", detalhe: codigo, ts: Date.now() });
    startValidar(async () => {
      try {
        const r = await fetch("/api/motorista/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
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

        // Captura GPS
        setFeedback({
          tipo: "ok",
          titulo: "Pedido validado, capturando GPS…",
          detalhe: validacao.codigo,
          ts: Date.now(),
        });
        const gps = await captureGps(6000);

        // HARD NAVIGATION pra rota nova. Isso força reload completo do iOS:
        // descarta TODO o estado do scanner, libera todos os recursos de câmera
        // antes de mostrar o input de foto. Sem isso, iOS Safari crashava a tab
        // quando renderizava a etapa de foto na mesma página.
        const params = new URLSearchParams({
          id: validacao.entregaId,
          codigo: validacao.codigo,
        });
        if (gps) {
          params.set("lat", String(gps.lat));
          params.set("lng", String(gps.lng));
          params.set("acc", String(gps.precisao_metros));
        }
        window.location.assign(`/motorista/foto?${params.toString()}`);
      } catch (e) {
        setFeedback({
          tipo: "erro",
          titulo: "Erro inesperado",
          detalhe: e instanceof Error ? e.message : String(e),
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

  return (
    <div className="flex flex-col gap-4 pb-12">
      <RegisterSW />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {nome}!</h1>
          <p className="text-sm text-zinc-600">
            {dataBR} · {pendentes.length} {pendentes.length === 1 ? "entrega pendente" : "entregas pendentes"}
            {entregues.length > 0 && ` · ${entregues.length} já entregue(s)`}
          </p>
          {(role === "aprovador" || role === "comprador") && (
            <p className="mt-1 text-xs text-amber-700">
              Você está visualizando como motorista.
            </p>
          )}
        </div>
        <OfflineStatus />
      </div>

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
    </div>
  );
}
