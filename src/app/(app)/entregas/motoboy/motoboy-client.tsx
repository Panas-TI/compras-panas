"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Sede: Av. Benjamin Constant, 1235 - São João, Porto Alegre
const SEDE = { lat: -30.0071306, lon: -51.1894901 };
// Grupos do relatório que NÃO são corrida de motoboy
const GRUPOS_IGNORADOS = new Set(["BALCÃO", "BALCAO", "CONSUMO INTERNO"]);
// Cache de geocodificação+rota no navegador (endereços repetem toda semana)
const CACHE_KEY = "motoboy-km-cache-v2"; // v2: geocode com abreviações/aprox
const RESULTADO_KEY = "motoboy-ultimo-resultado-v1"; // último resultado processado

type Corrida = {
  pedido: string;
  dataHora: string;
  entregador: string;
  endereco: string;
  km: number | null; // null = não localizado
  aprox?: boolean; // km aproximado (achou só a rua, sem o número)
};

type Fase = "idle" | "processando" | "pronto";

type CacheEntry = { km: number; aprox?: boolean } | { falha: true };

function lerCache(): Record<string, CacheEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return {};
    // Descarta entries corrompidos (null, não-objeto) pra não quebrar depois
    const limpo: Record<string, CacheEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === "object") limpo[k] = v as CacheEntry;
    }
    return limpo;
  } catch {
    return {};
  }
}
function salvarCache(c: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // cache cheio — segue sem cache
  }
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Normaliza o endereço pra chave de cache e busca
function normalizar(end: string): string {
  return end.replace(/\s+/g, " ").trim().toUpperCase();
}

// Expande abreviações que o Queóps usa mas o OpenStreetMap não entende
const ABREV: Array<[RegExp, string]> = [
  [/^R\.?\s+/i, "Rua "],
  [/^AV\.?\s+/i, "Avenida "],
  [/^TRAV\.?\s+/i, "Travessa "],
  [/\bCEL\.?\s+/gi, "Coronel "],
  [/\bALM\.?\s+/gi, "Almirante "],
  [/\bDR\.?\s+/gi, "Doutor "],
  [/\bDRA\.?\s+/gi, "Doutora "],
  [/\bPROF\.?\s+/gi, "Professor "],
  [/\bMAL\.?\s+/gi, "Marechal "],
  [/\bSEN\.?\s+/gi, "Senador "],
  [/\bPRES\.?\s+/gi, "Presidente "],
  [/\bGEN\.?\s+/gi, "General "],
  [/\bCAP\.?\s+/gi, "Capitão "],
  [/\bENG\.?\s+/gi, "Engenheiro "],
];
// Palavras que poluem o nome da rua (vieram do cadastro do pedido)
const RUIDO = /\b(GALERIA|EDIF[IÍ]CIO|PR[EÉ]DIO|CONDOM[IÍ]NIO|COND|ESQUINA|ESQ|FUNDOS|LOJA|SALA|BLOCO)\b\.?/gi;

function expandir(end: string): string {
  let s = end.replace(/\s+/g, " ").trim();
  for (const [re, sub] of ABREV) s = s.replace(re, sub);
  s = s.replace(RUIDO, " ").replace(/\s+/g, " ").trim();
  // "AVENIDA AV. BENJAMIN" → remove duplicação
  s = s.replace(/\b(Rua|Avenida|Travessa)\s+(Rua|Avenida|Travessa)\b/gi, "$1");
  return s;
}

// "Attílio" → "Atílio": colapsa consoantes dobradas que não existem em PT
// (preserva RR e SS, que são legítimas)
function colapsarDobradas(s: string): string {
  return s.replace(/([bcdfghjklmnpqtvwxz])\1/gi, "$1");
}

async function buscaNominatim(q: string): Promise<{ lat: number; lon: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: `${q}, Porto Alegre, RS, Brazil`,
      format: "json",
      limit: "1",
      countrycodes: "br",
    });
  try {
    const resp = await fetch(url);
    const d = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (d.length > 0) return { lat: Number(d[0].lat), lon: Number(d[0].lon) };
  } catch {
    // falha de rede — trata como não encontrado
  }
  return null;
}

async function geocodificar(
  endereco: string
): Promise<{ lat: number; lon: number; aprox: boolean } | null> {
  const limpo = expandir(endereco);
  const m = limpo.match(/^(.+?)\s+(\d+)/);
  const rua = m ? m[1] : null;
  const num = m && m[2] !== "0" ? m[2] : null; // nº 0 não existe — vira busca só por rua

  // Cascata: mais preciso → mais aproximado
  const tentativas: Array<{ q: string; aprox: boolean }> = [];
  if (rua && num) {
    tentativas.push({ q: `${rua} ${num}`, aprox: false });
    tentativas.push({ q: `${colapsarDobradas(rua)} ${num}`, aprox: false });
  }
  if (rua) {
    tentativas.push({ q: rua, aprox: true });
    tentativas.push({ q: colapsarDobradas(rua), aprox: true });
  }
  if (!rua) tentativas.push({ q: limpo, aprox: false });

  // dedup mantendo a ordem
  const vistas = new Set<string>();
  for (const t of tentativas) {
    const k = t.q.toUpperCase();
    if (vistas.has(k)) continue;
    vistas.add(k);
    const r = await buscaNominatim(t.q);
    if (r) return { ...r, aprox: t.aprox };
    await dorme(1100); // rate limit Nominatim: 1 req/s
  }
  return null;
}

async function rotaKm(dest: { lat: number; lon: number }): Promise<number | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${SEDE.lon},${SEDE.lat};${dest.lon},${dest.lat}?overview=false`;
  try {
    const resp = await fetch(url);
    const d = await resp.json();
    if (d.routes?.[0]?.distance != null) return d.routes[0].distance / 1000;
  } catch {
    // falha de rede
  }
  return null;
}

export function MotoboyClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("idle");
  const [status, setStatus] = useState("");
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [importadoEm, setImportadoEm] = useState<string | null>(null);

  // Ao abrir a página, recupera o último resultado processado (persiste
  // entre navegações — não precisa reanexar toda vez que voltar aqui).
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(RESULTADO_KEY);
      if (!salvo) return;
      const d = JSON.parse(salvo) as { corridas: Corrida[]; em: string };
      if (Array.isArray(d.corridas) && d.corridas.length > 0) {
        setCorridas(d.corridas);
        setImportadoEm(d.em);
        setFase("pronto");
      }
    } catch {
      // resultado salvo corrompido — ignora
    }
  }, []);

  const processar = async (file: File) => {
    setErro(null);
    setFase("processando");
    // NÃO limpa os resultados atuais — só substitui quando o novo terminar
    // (evita a tela "sumir" durante o processamento).
    try {
      // 1. Parse do .xls no navegador
      setStatus("Lendo o arquivo...");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      // 2. Extrai as corridas (estrutura do Relatório de Entregas do Queóps:
      //    linha com nome do entregador → linha "Pedido..." → linhas de dados)
      const brutas: Omit<Corrida, "km">[] = [];
      let grupo: string | null = null;
      for (let i = 0; i < linhas.length; i++) {
        const c0 = String(linhas[i]?.[0] ?? "").trim();
        if (!c0) continue;
        const proximo = String(linhas[i + 1]?.[0] ?? "").trim();
        if (c0 !== "Pedido" && c0 !== "Fechados" && c0 !== "Entregador" && isNaN(Number(c0))) {
          if (proximo === "Pedido") grupo = c0;
        } else if (!isNaN(Number(c0)) && Number(c0) > 1000 && grupo) {
          if (GRUPOS_IGNORADOS.has(grupo.toUpperCase())) continue;
          const endereco = String(linhas[i]?.[4] ?? "").trim();
          if (!endereco) continue;
          brutas.push({
            pedido: String(Math.trunc(Number(c0))),
            dataHora: String(linhas[i]?.[2] ?? "").trim(),
            entregador: grupo,
            endereco,
          });
        }
      }
      if (brutas.length === 0) {
        throw new Error(
          "Nenhuma corrida de motoboy encontrada. Confere se é o Relatório de Entregas do Queóps (.xls)."
        );
      }

      // 3. Km por endereço único (cache no navegador acelera as próximas semanas)
      const cache = lerCache();
      const unicos = Array.from(new Set(brutas.map((b) => normalizar(b.endereco))));
      const novos = unicos.filter((e) => !cache[e]);
      setProgresso({ feito: 0, total: novos.length });

      let feitos = 0;
      for (const end of novos) {
        setStatus(`Calculando rotas (${feitos + 1}/${novos.length} endereços novos)...`);
        const coords = await geocodificar(end);
        if (coords) {
          const km = await rotaKm(coords);
          cache[end] = km != null ? { km, aprox: coords.aprox || undefined } : { falha: true };
        } else {
          cache[end] = { falha: true };
        }
        feitos++;
        setProgresso({ feito: feitos, total: novos.length });
        salvarCache(cache);
        await dorme(1100); // gentileza com o Nominatim
      }

      // 4. Monta o resultado
      const resultado: Corrida[] = brutas.map((b) => {
        const entry = cache[normalizar(b.endereco)];
        return {
          ...b,
          km: entry && "km" in entry ? entry.km : null,
          aprox: entry && "km" in entry ? entry.aprox : undefined,
        };
      });
      setCorridas(resultado);
      const agora = new Date().toLocaleString("pt-BR");
      setImportadoEm(agora);
      setFase("pronto");
      setStatus("");
      // Persiste o resultado pra continuar disponível ao voltar na página
      try {
        localStorage.setItem(RESULTADO_KEY, JSON.stringify({ corridas: resultado, em: agora }));
      } catch {
        // storage cheio — segue sem persistir
      }
    } catch (e) {
      console.error("Motoboy: falha ao processar", e);
      setErro(
        "Não consegui processar esse arquivo: " +
          (e instanceof Error ? e.message : String(e)) +
          ". Confere se é o Relatório de Entregas do Queóps (.xls)."
      );
      // Mantém os resultados anteriores na tela se já havia algum
      setFase((f) => (corridas.length > 0 ? "pronto" : "idle"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Agrupa por entregador pro resumo
  const porEntregador = new Map<string, Corrida[]>();
  for (const c of corridas) {
    const arr = porEntregador.get(c.entregador) ?? [];
    arr.push(c);
    porEntregador.set(c.entregador, arr);
  }
  const grupos = Array.from(porEntregador.entries()).sort((a, b) => b[1].length - a[1].length);
  const kmTotal = corridas.reduce((s, c) => s + (c.km ?? 0), 0);
  const falhas = corridas.filter((c) => c.km == null);

  const exportCsv = () => {
    const linhas = [
      ["Entregador", "Pedido", "Data/hora", "Endereço", "Km (ida)"].join(";"),
      ...corridas.map((c) =>
        [
          c.entregador,
          c.pedido,
          c.dataHora,
          `"${c.endereco.replace(/"/g, "'")}"`,
          c.km != null
            ? (c.aprox ? "≈" : "") + c.km.toFixed(2).replace(".", ",")
            : "NÃO LOCALIZADO",
        ].join(";")
      ),
    ];
    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "km-motoboys.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processar(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={fase === "processando"}>
            {fase === "processando" ? "Processando..." : "📎 Anexar relatório (.xls)"}
          </Button>
          {fase === "processando" && (
            <div className="flex flex-1 min-w-[240px] flex-col gap-1">
              <span className="text-sm text-zinc-600">{status}</span>
              {progresso.total > 0 && (
                <div className="h-2 w-full overflow-hidden rounded bg-zinc-100">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(progresso.feito / progresso.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {fase === "pronto" && (
            <>
              <Button variant="outline" onClick={exportCsv}>
                ⬇ Exportar CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!confirm("Limpar o resultado atual?")) return;
                  localStorage.removeItem(RESULTADO_KEY);
                  setCorridas([]);
                  setImportadoEm(null);
                  setFase("idle");
                }}
              >
                Limpar
              </Button>
              {importadoEm && (
                <span className="text-xs text-zinc-400">Importado em {importadoEm}</span>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {fase === "processando" && progresso.total > 20 && (
        <p className="text-xs text-zinc-500">
          Endereços novos levam ~1s cada (limite do serviço gratuito de mapas). Endereços já
          vistos em relatórios anteriores ficam guardados e saem na hora.
        </p>
      )}

      {/* Resumo por entregador */}
      {fase === "pronto" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500">Corridas</div>
                <div className="text-2xl font-semibold">{corridas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500">Km total (ida)</div>
                <div className="text-2xl font-semibold tabular-nums">{kmTotal.toFixed(1)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500">Entregadores</div>
                <div className="text-2xl font-semibold">{grupos.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-zinc-500">Não localizados</div>
                <div className={`text-2xl font-semibold ${falhas.length ? "text-amber-600" : ""}`}>
                  {falhas.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {grupos.map(([entregador, lista]) => {
            const km = lista.reduce((s, c) => s + (c.km ?? 0), 0);
            return (
              <details key={entregador} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 bg-zinc-50 px-4 py-2.5 hover:bg-zinc-100">
                  <span className="font-semibold text-zinc-800">{entregador}</span>
                  <span className="text-sm text-zinc-600">
                    {lista.length} corridas · <strong className="tabular-nums">{km.toFixed(1)} km</strong>
                  </span>
                </summary>
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-1.5">Pedido</th>
                      <th className="px-3 py-1.5">Data/hora</th>
                      <th className="px-3 py-1.5">Endereço</th>
                      <th className="px-3 py-1.5 text-right">Km (ida)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => (
                      <tr key={c.pedido + c.dataHora} className="border-b border-zinc-50 last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{c.pedido}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{c.dataHora}</td>
                        <td className="px-3 py-1.5">{c.endereco}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {c.km != null ? (
                            <span title={c.aprox ? "Aproximado: achou a rua mas não o número exato" : undefined}>
                              {c.aprox ? "≈ " : ""}
                              {c.km.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-amber-600" title="Endereço não localizado no mapa">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}

          {falhas.length > 0 && (
            <p className="text-xs text-zinc-500">
              ⚠ {falhas.length} endereço(s) não localizados (escritos de forma incompleta no
              Queóps) — aparecem com &quot;—&quot; e não somam no total. Vale conferir esses
              manualmente.
            </p>
          )}
        </>
      )}
    </div>
  );
}
