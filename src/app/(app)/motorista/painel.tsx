"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OfflineStatus } from "@/lib/offline/offline-status";
import { RegisterSW } from "@/lib/offline/register-sw";

// Identificação da entrega passou a ser CLIENT-SIDE: o motorista digita os 5
// últimos dígitos do código_queops e o filtro roda em cima da lista de
// pendentes que já veio carregada no boot da página. Zero round-trip pra
// validar — funciona até sem internet.

type Entrega = {
  id: string;
  codigo_queops: string;
  status: string;
  hora_entrega: string | null;
  cliente_nome: string | null;
  bairro: string | null;
  entregue_at: string | null;
  endereco_rua?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  cidade?: string | null;
  uf?: string | null;
  valor_total?: number | string | null;
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

function formatBRL(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function enderecoCompleto(e: Entrega): string {
  const partes: string[] = [];
  if (e.endereco_rua) partes.push(e.endereco_rua);
  if (e.endereco_numero) partes.push(e.endereco_numero);
  let s = partes.join(", ");
  if (e.endereco_complemento) s += ` — ${e.endereco_complemento}`;
  if (e.bairro) s += ` · ${e.bairro}`;
  const cid: string[] = [];
  if (e.cidade) cid.push(e.cidade);
  if (e.uf) cid.push(e.uf);
  if (cid.length > 0) s += ` · ${cid.join("/")}`;
  return s.trim();
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
  const [sufixo, setSufixo] = useState("");
  const [navegando, setNavegando] = useState(false);
  const [escolhida, setEscolhida] = useState<Entrega | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Autofocus no input no mount — assim o teclado numérico já abre.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filtro client-side por sufixo de 5 dígitos. Ordenado por hora_entrega
  // (igual a lista vem do server) — em caso de colisão isso reforça a ordem
  // natural da rota.
  const matches = useMemo(() => {
    if (sufixo.length !== 5) return [];
    return pendentes.filter((e) => {
      const cod = e.codigo_queops ?? "";
      return cod.slice(-5) === sufixo;
    });
  }, [sufixo, pendentes]);

  const onSufixoChange = (raw: string) => {
    // só dígitos, máx 5
    const limpo = raw.replace(/\D/g, "").slice(0, 5);
    setSufixo(limpo);
    setEscolhida(null);
  };

  const limpar = () => {
    setSufixo("");
    setEscolhida(null);
    inputRef.current?.focus();
  };

  const confirmar = async (entrega: Entrega) => {
    if (navegando) return;
    setNavegando(true);
    setFeedback({
      tipo: "ok",
      titulo: "Capturando GPS…",
      detalhe: entrega.codigo_queops,
      ts: Date.now(),
    });
    const gps = await captureGps(6000);

    // HARD NAVIGATION pra rota de foto (mesmo padrão de antes — descarta
    // estado da página atual antes de mostrar o input de foto no iOS Safari).
    const params = new URLSearchParams({
      id: entrega.id,
      codigo: entrega.codigo_queops,
    });
    if (gps) {
      params.set("lat", String(gps.lat));
      params.set("lng", String(gps.lng));
      params.set("acc", String(gps.precisao_metros));
    }
    window.location.assign(`/motorista/foto?${params.toString()}`);
  };

  // Estado de "match único confirmado" pode vir de (a) só ter 1 match natural
  // ou (b) o motorista ter tocado num candidato na lista de colisão.
  const matchUnico: Entrega | null =
    escolhida ?? (matches.length === 1 ? matches[0] : null);

  return (
    <div className="flex flex-col gap-4 pb-12">
      <RegisterSW />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {nome}!</h1>
          <p className="text-sm text-zinc-600">
            {dataBR} · {pendentes.length}{" "}
            {pendentes.length === 1 ? "entrega pendente" : "entregas pendentes"}
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

      {/* CARD PRINCIPAL — input dos 5 últimos dígitos */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="sufixo" className="text-sm font-medium">
              Últimos 5 dígitos do pedido
            </label>
            {sufixo.length > 0 && (
              <button
                type="button"
                onClick={limpar}
                className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <input
            id="sufixo"
            ref={inputRef}
            value={sufixo}
            onChange={(e) => onSufixoChange(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0000"
            className="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-4 text-center font-mono text-4xl tabular-nums tracking-widest focus:border-emerald-500 focus:outline-none"
            style={{ minHeight: 72 }}
          />
          <p className="text-xs text-zinc-500">
            O teclado numérico abre automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* ZONA DE RESULTADO */}
      {sufixo.length === 5 && matches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col gap-1 border-l-4 border-red-400 p-4">
            <div className="text-base font-semibold text-red-800">
              Nenhuma entrega pendente terminando em {sufixo}
            </div>
            <p className="text-sm text-red-700">
              Confere com o atendimento ou tenta de novo.
            </p>
          </CardContent>
        </Card>
      )}

      {sufixo.length === 5 && matchUnico && (
        <Card>
          <CardContent className="flex flex-col gap-3 border-l-4 border-emerald-500 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
                ENCONTRADO
              </span>
              <span className="font-mono text-xs text-zinc-500">
                {matchUnico.codigo_queops}
              </span>
            </div>
            {matchUnico.cliente_nome && (
              <div className="text-lg font-semibold text-zinc-900">
                {matchUnico.cliente_nome}
              </div>
            )}
            {enderecoCompleto(matchUnico) && (
              <div className="text-sm text-zinc-700">
                {enderecoCompleto(matchUnico)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700">
              {matchUnico.hora_entrega && (
                <span>⏰ {matchUnico.hora_entrega.slice(0, 5)}</span>
              )}
              {formatBRL(matchUnico.valor_total) && (
                <span className="font-medium">
                  {formatBRL(matchUnico.valor_total)}
                </span>
              )}
            </div>
            {escolhida && matches.length > 1 && (
              <button
                type="button"
                onClick={() => setEscolhida(null)}
                className="self-start text-xs font-medium text-zinc-500 underline-offset-2 hover:underline"
              >
                ← Voltar pra lista
              </button>
            )}
            <Button
              type="button"
              onClick={() => confirmar(matchUnico)}
              disabled={navegando}
              className="h-16 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
            >
              {navegando ? "Capturando GPS…" : "✓ Confirmar entrega"}
            </Button>
          </CardContent>
        </Card>
      )}

      {sufixo.length === 5 && !escolhida && matches.length > 1 && (
        <div className="flex flex-col gap-2">
          <Card>
            <CardContent className="border-l-4 border-amber-400 p-3">
              <div className="text-sm font-semibold text-amber-900">
                ⚠ {matches.length} pedidos terminam em {sufixo} — escolhe qual
              </div>
            </CardContent>
          </Card>
          {matches.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEscolhida(e)}
              className="rounded-md border border-zinc-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
              style={{ minHeight: 80 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-zinc-500">
                  {e.codigo_queops}
                </span>
                {e.hora_entrega && (
                  <span className="text-xs text-zinc-600">
                    ⏰ {e.hora_entrega.slice(0, 5)}
                  </span>
                )}
              </div>
              {e.cliente_nome && (
                <div className="mt-1 text-base font-semibold text-zinc-900">
                  {e.cliente_nome}
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-zinc-700">
                {e.bairro && <span>{e.bairro}</span>}
                {e.endereco_rua && (
                  <span className="text-zinc-500">
                    {e.endereco_rua}
                    {e.endereco_numero ? `, ${e.endereco_numero}` : ""}
                  </span>
                )}
              </div>
              {formatBRL(e.valor_total) && (
                <div className="mt-1 text-sm font-medium text-zinc-700">
                  {formatBRL(e.valor_total)}
                </div>
              )}
            </button>
          ))}
        </div>
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
          {feedback.detalhe && (
            <div className="font-mono text-sm">{feedback.detalhe}</div>
          )}
        </div>
      )}

      {/* SEÇÃO Pendentes hoje — referência visual, com sufixo destacado */}
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
            {pendentes.map((e) => {
              const suf = (e.codigo_queops ?? "").slice(-5);
              const destacar = sufixo.length === 5 && suf === sufixo;
              return (
                <Card
                  key={e.id}
                  className={destacar ? "ring-2 ring-emerald-400" : undefined}
                >
                  <CardContent className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        {e.status === "em_rota" ? "EM ROTA" : "PENDENTE"}
                      </span>
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-base font-bold tabular-nums text-blue-800">
                        …{suf}
                      </span>
                    </div>
                    {(e.cliente_nome || e.bairro || e.hora_entrega) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700">
                        {e.hora_entrega && (
                          <span>⏰ {e.hora_entrega.slice(0, 5)}</span>
                        )}
                        {e.cliente_nome && <span>{e.cliente_nome}</span>}
                        {e.bairro && (
                          <span className="text-zinc-500">{e.bairro}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                    ✓
                  </span>
                  <span className="font-mono">{e.codigo_queops}</span>
                  {e.cliente_nome && (
                    <span className="text-zinc-600">{e.cliente_nome}</span>
                  )}
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
