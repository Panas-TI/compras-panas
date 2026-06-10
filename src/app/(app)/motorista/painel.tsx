"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScannerCodigo } from "@/components/scanner/scanner-codigo";
import { SwRegister } from "@/components/offline/sw-register";
import { useOffline } from "@/lib/offline/use-offline";
import { adicionarPendente, type GpsCapturado } from "@/lib/offline/db";
import { marcarEntregueAction } from "./actions";

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
  tipo: "ok" | "warn" | "erro" | "offline";
  titulo: string;
  detalhe?: string;
  ts: number;
};

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
  const offline = useOffline({
    onSyncSuccess: () => router.refresh(),
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [marcando, startMarcar] = useTransition();
  const [manual, setManual] = useState("");

  const dataBR = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

  const onCodigo = (codigo: string) => {
    const codigoLimpo = codigo.trim();
    if (!codigoLimpo) return;

    setFeedback({ tipo: "ok", titulo: "Capturando GPS…", detalhe: codigoLimpo, ts: Date.now() });

    startMarcar(async () => {
      const gps = await captureGps(8000);

      // Se está offline, salva na fila e sai
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await adicionarPendente(codigoLimpo, gps);
          setFeedback({
            tipo: "offline",
            titulo: "📥 Salvo offline",
            detalhe: `${codigoLimpo} — sincroniza quando voltar ao sinal`,
            ts: Date.now(),
          });
          offline.recontar();
        } catch (e) {
          setFeedback({
            tipo: "erro",
            titulo: "Erro ao salvar offline",
            detalhe: e instanceof Error ? e.message : String(e),
            ts: Date.now(),
          });
        }
        return;
      }

      // Online → chama action direto
      try {
        const res = await marcarEntregueAction(codigoLimpo, gps);
        if (!res) return;
        if (res.ok) {
          setFeedback({
            tipo: "ok",
            titulo: "✓ Entregue!",
            detalhe: `${res.codigo}${gps ? "" : " (sem GPS)"}`,
            ts: Date.now(),
          });
          router.refresh();
          return;
        }
        const t: Record<typeof res.reason, "warn" | "erro"> = {
          nao_encontrado: "erro",
          outro_motorista: "warn",
          outro_dia: "warn",
          ja_entregue: "warn",
          erro: "erro",
        };
        setFeedback({
          tipo: t[res.reason],
          titulo: res.message,
          detalhe: `Código lido: ${codigoLimpo}`,
          ts: Date.now(),
        });
      } catch (e) {
        // Erro de rede mesmo com navigator.onLine = true (ex: timeout). Cai pra fila.
        try {
          await adicionarPendente(codigoLimpo, gps);
          setFeedback({
            tipo: "offline",
            titulo: "📥 Sem conexão — salvo offline",
            detalhe: `${codigoLimpo}: ${e instanceof Error ? e.message : String(e)}`,
            ts: Date.now(),
          });
          offline.recontar();
        } catch {
          setFeedback({
            tipo: "erro",
            titulo: "Falhou e não consegui salvar offline",
            detalhe: e instanceof Error ? e.message : String(e),
            ts: Date.now(),
          });
        }
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
      <SwRegister />

      {/* Indicador de status */}
      <div
        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${
          offline.online
            ? offline.pendentes > 0
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-red-300 bg-red-50 text-red-900"
        }`}
      >
        <span>
          {offline.online ? "🟢 Online" : "🔴 Offline"}
          {offline.pendentes > 0 && ` · ${offline.pendentes} bipada(s) na fila`}
          {offline.sincronizando && " · Sincronizando…"}
        </span>
        {offline.online && offline.pendentes > 0 && !offline.sincronizando && (
          <button
            type="button"
            onClick={() => offline.tentarSincronizar()}
            className="rounded border border-current px-2 py-0.5 text-xs"
          >
            Sincronizar agora
          </button>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Olá, {nome}!</h1>
        <p className="text-sm text-zinc-600">
          {dataBR} · {pendentes.length} {pendentes.length === 1 ? "entrega pendente" : "entregas pendentes"}
          {entregues.length > 0 && ` · ${entregues.length} já entregue(s)`}
        </p>
        {role === "aprovador" && (
          <p className="mt-1 text-xs text-amber-700">
            Você está visualizando como motorista. Atribua entregas a si mesmo em /entregas/dia pra testar.
          </p>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Marcar entrega como entregue</p>
            <p className="text-xs text-zinc-500">
              Aponta a câmera no código de barras do pedido entregue. O GPS é capturado automaticamente.
              {!offline.online && " Sem sinal? Bipa mesmo assim, salva na fila e sincroniza depois."}
            </p>
          </div>
          <ScannerCodigo onCodigo={onCodigo} labelIniciar="📷 Bipar pra entregar" />
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
              disabled={marcando || !manual.trim()}
            >
              Marcar
            </Button>
          </div>
        </CardContent>
      </Card>

      {feedback && (
        <div
          className={`rounded-md border-2 px-4 py-3 text-base ${
            feedback.tipo === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : feedback.tipo === "warn"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : feedback.tipo === "offline"
                  ? "border-blue-300 bg-blue-50 text-blue-900"
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
