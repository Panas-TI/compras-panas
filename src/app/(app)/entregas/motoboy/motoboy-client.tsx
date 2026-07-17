"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { geocodificarCnefe } from "./cnefe";
import { createClient } from "@/lib/supabase/client";

type Inicial = { corridas: Corrida[]; em: string; por: string | null } | null;

// Salva o resultado no banco pra qualquer pessoa/computador ver (via cliente
// do navegador — a sessão do usuário autentica o INSERT na RLS).
async function salvarRelatorio(
  corridas: Corrida[],
  usuario: string | null
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const sb = createClient();
    const kmTotal = corridas.reduce((s, c) => s + (c.km ?? 0), 0);
    const { error } = await sb.from("motoboy_relatorios").insert({
      importado_por: usuario,
      n_corridas: corridas.length,
      km_total: Number(kmTotal.toFixed(2)),
      corridas,
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Sede: Av. Benjamin Constant, 1235 - São João, Porto Alegre.
// Coordenada oficial do IBGE (CNEFE) desse endereço exato — mesma fonte dos
// destinos, pra o km ficar internamente consistente.
const SEDE = { lat: -30.012387, lon: -51.194219 };
// Grupos do relatório que NÃO são corrida de motoboy
const GRUPOS_IGNORADOS = new Set(["BALCÃO", "BALCAO", "CONSUMO INTERNO"]);
// Cache de geocodificação+rota no navegador (endereços repetem toda semana)
const CACHE_KEY = "motoboy-km-cache-v6"; // v6: localizar e rotear separados
const GOOGLE_KEY_LS = "motoboy-google-key"; // chave da API Google (opcional)

function chaveGoogle(): string | null {
  const env = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (env) return env;
  try {
    return localStorage.getItem(GOOGLE_KEY_LS) || null;
  } catch {
    return null;
  }
}

export type Corrida = {
  pedido: string;
  dataHora: string;
  entregador: string;
  endereco: string;
  km: number | null; // null = sem km (ver motivo)
  aprox?: boolean; // km aproximado (achou só a rua, sem o número)
  resolvido?: string; // endereço que o mapa efetivamente usou (auditoria)
  motivo?: "semrua" | "semrota"; // por que ficou sem km
};

type Fase = "idle" | "processando" | "pronto";

// Estados no cache:
//  - {km}        rota calculada (completo)
//  - {lat,lon}   endereço localizado, mas a rota ainda não foi calculada
//                (falha temporária do OSRM) — será tentado de novo
//  - {semRua}    a rua não foi encontrada em nenhuma fonte (erro de digitação)
type CacheEntry =
  | { km: number; aprox?: boolean; resolvido?: string }
  | { lat: number; lon: number; aprox?: boolean; resolvido?: string }
  | { semRua: true };

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

// ==================== GEOCODIFICAÇÃO v3 ====================
// Validada contra os 264 endereços reais do relatório da Beloli.
// Pipeline: normalizador (abreviações/typos/ruído) → extrator rua+número →
// Photon (busca fuzzy, aguenta erro de grafia) → Nominatim estruturado →
// fallback meio-da-rua (≈). Todo resultado é validado: precisa estar dentro
// de Porto Alegre E o nome da rua achada precisa parecer com o buscado.

const BBOX = { latMin: -30.32, latMax: -29.9, lonMin: -51.35, lonMax: -51.0 };

const ABREV: Record<string, string> = {
  R: "RUA", AV: "AVENIDA", AVE: "AVENIDA", TRAV: "TRAVESSA", TV: "TRAVESSA",
  AL: "ALAMEDA", PC: "PRAÇA", PÇA: "PRAÇA", PCA: "PRAÇA", ESTR: "ESTRADA",
  BC: "BECO", AC: "ACESSO", LG: "LARGO",
  CEL: "CORONEL", ALM: "ALMIRANTE", DR: "DOUTOR", DRA: "DOUTORA",
  PROF: "PROFESSOR", ENG: "ENGENHEIRO", SEN: "SENADOR", DEP: "DEPUTADO",
  GEN: "GENERAL", GAL: "GENERAL", MAL: "MARECHAL", CAP: "CAPITÃO",
  TEN: "TENENTE", PRES: "PRESIDENTE", STO: "SANTO", STA: "SANTA",
  VISC: "VISCONDE",
};
const TYPOS: Record<string, string> = {
  BEIJAMIN: "BENJAMIN", BENJAMIM: "BENJAMIN", CAIRÚ: "CAIRU",
};
const POLUICAO = new Set([
  "GALERIA", "COND", "CONDOMINIO", "CONDOMÍNIO", "EDIF", "ED", "PREDIO", "PRÉDIO",
]);
const TIPOS_VIA = new Set([
  "RUA", "AVENIDA", "TRAVESSA", "ALAMEDA", "PRAÇA", "ESTRADA", "BECO", "ACESSO", "LARGO", "VIA",
]);

function semAcento(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// Endereço bruto → { rua, numero }. Heurística do número: primeiro token
// numérico cujo token ANTERIOR é alfabético e não é tipo de via — assim
// "RUA 24 DE OUTUBRO 1121 apto 702" acha 1121, não o 24 do nome da rua.
function extrair(raw: string): { rua: string; numero: string | null } {
  const toks = raw
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => {
      const semPonto = t.replace(/\.$/, "");
      const exp = ABREV[semPonto] ?? semPonto;
      return TYPOS[exp] ?? exp;
    })
    .filter((t) => !POLUICAO.has(t));
  let numero: string | null = null;
  let ruaToks = toks;
  for (let i = 0; i < toks.length; i++) {
    if (/^\d{1,5}$/.test(toks[i])) {
      const ant = toks[i - 1];
      if (i > 0 && ant && !/^\d+$/.test(ant) && !TIPOS_VIA.has(ant)) {
        if (parseInt(toks[i], 10) > 0) numero = toks[i];
        ruaToks = toks.slice(0, i);
        break;
      }
    }
  }
  return { rua: ruaToks.join(" "), numero };
}

// Similaridade por bigramas (Dice) — barra a "rua parecida em outro lugar"
function similaridade(a: string, b: string): number {
  const na = semAcento(a).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nb = semAcento(b).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const big = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = big(na), mb = big(nb);
  let inter = 0, total = 0;
  for (const [bg, n] of ma) {
    inter += Math.min(n, mb.get(bg) ?? 0);
    total += n;
  }
  for (const n of mb.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

function dentroPoa(lat: number, lon: number): boolean {
  return lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax;
}

function ruaSemTipo(rua: string): string {
  const toks = rua.split(" ");
  return TIPOS_VIA.has(toks[0]) ? toks.slice(1).join(" ") : rua;
}

// ---------- GOOGLE (precisão de porta) — usado quando há chave ----------
type GeoGoogle = { lat: number; lon: number; aprox: boolean; resolvido: string };

async function geocodeGoogle(endereco: string, key: string): Promise<GeoGoogle | null | "sem_chave_valida"> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    new URLSearchParams({
      address: `${endereco}, Porto Alegre, RS, Brasil`,
      components: "locality:Porto Alegre|country:BR",
      key,
    });
  try {
    const resp = await fetch(url);
    const d = (await resp.json()) as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number }; location_type: string };
        formatted_address: string;
        partial_match?: boolean;
      }>;
    };
    if (d.status === "REQUEST_DENIED" || d.status === "OVER_QUERY_LIMIT") return "sem_chave_valida";
    const r = d.results?.[0];
    if (d.status !== "OK" || !r) return null;
    const { lat, lng } = r.geometry.location;
    if (!dentroPoa(lat, lng)) return null;
    // ROOFTOP = porta exata; RANGE_INTERPOLATED = interpolado na quadra (ótimo)
    const tipo = r.geometry.location_type;
    const exato = tipo === "ROOFTOP" || tipo === "RANGE_INTERPOLATED";
    return {
      lat,
      lon: lng,
      aprox: !exato,
      resolvido:
        r.formatted_address.split(" - ").slice(0, 2).join(" - ") +
        ` — Google (${tipo === "ROOFTOP" ? "porta exata" : tipo === "RANGE_INTERPOLATED" ? "interpolado na quadra" : "aproximado"})`,
    };
  } catch {
    return null;
  }
}

// ---------- FASE A: rua canônica (Photon, aceita erro de grafia) ----------
type RuaCanonica = { nome: string; lat: number; lon: number };

async function ruaCanonica(ruaBusca: string): Promise<RuaCanonica | null> {
  const url =
    "https://photon.komoot.io/api/?" +
    new URLSearchParams({
      q: `${ruaBusca}, Porto Alegre`,
      limit: "5",
      lat: String(SEDE.lat),
      lon: String(SEDE.lon),
    });
  try {
    const resp = await fetch(url);
    const d = (await resp.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { street?: string; name?: string; osm_key?: string };
      }>;
    };
    const alvo = ruaSemTipo(ruaBusca);
    for (const f of d.features ?? []) {
      const [lon, lat] = f.geometry.coordinates;
      if (!dentroPoa(lat, lon)) continue;
      const p = f.properties;
      if (p.osm_key !== "highway" && !p.street) continue; // só vias
      const nome = p.name ?? p.street ?? "";
      if (similaridade(alvo, nome) >= 0.45) return { nome, lat, lon };
    }
  } catch {
    // rede — trata como não achada
  }
  return null;
}

// ---------- Rota (OSRM) — km real de carro da sede até o destino ----------
// O servidor gratuito do OSRM limita rajadas: várias tentativas + servidor
// reserva, pra uma falha temporária NÃO virar "endereço não existe".
const OSRM_HOSTS = [
  "https://router.project-osrm.org",
  "https://routing.openstreetmap.de/routed-car",
];

async function rotaKm(dest: { lat: number; lon: number }): Promise<number | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const host = OSRM_HOSTS[tentativa % OSRM_HOSTS.length];
    const url = `${host}/route/v1/driving/${SEDE.lon},${SEDE.lat};${dest.lon},${dest.lat}?overview=false`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) {
        const d = await resp.json();
        if (d.routes?.[0]?.distance != null) return d.routes[0].distance / 1000;
      }
    } catch {
      // timeout/rede — tenta de novo (servidor alterna)
    }
    await dorme(600 * (tentativa + 1)); // recuo progressivo
  }
  return null; // falhou de verdade → NÃO é "endereço inexistente", é rota pendente
}

export function MotoboyClient({ inicial, usuario }: { inicial: Inicial; usuario: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>(inicial ? "pronto" : "idle");
  const [status, setStatus] = useState("");
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [corridas, setCorridas] = useState<Corrida[]>(inicial?.corridas ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [importadoEm, setImportadoEm] = useState<string | null>(inicial?.em ?? null);
  const [importadoPor, setImportadoPor] = useState<string | null>(inicial?.por ?? null);
  const [temChave, setTemChave] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  useEffect(() => {
    setTemChave(!!chaveGoogle());
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

      // ===== FASE 1 — LOCALIZAR o endereço (Google → IBGE → OpenStreetMap) =====
      // Só descobre a coordenada. A rota fica pra Fase 2. Assim, uma falha de
      // rota NUNCA vira "endereço não existe".
      const key = chaveGoogle();
      let googleInvalido = false;
      const paraLocalizar = unicos.filter((e) => !cache[e]);
      let fl = 0;
      for (const end of paraLocalizar) {
        fl++;
        setStatus(`Localizando endereços (${fl}/${paraLocalizar.length})...`);
        setProgresso({ feito: fl, total: paraLocalizar.length });
        const { rua, numero } = extrair(end);
        let geo: { lat: number; lon: number; aprox: boolean; resolvido: string } | null = null;

        // 1) Google (precisão de porta) — só se houver chave válida
        if (key && !googleInvalido) {
          let g = await geocodeGoogle(end, key);
          if (g === "sem_chave_valida") {
            googleInvalido = true;
            setErro("Chave do Google inválida ou sem cota — seguindo pela base do IBGE.");
          } else if (!g && rua) {
            const g2 = await geocodeGoogle(`${rua}${numero ? " " + numero : ""}`, key);
            if (g2 === "sem_chave_valida") googleInvalido = true;
            else g = g2;
          }
          if (g && g !== "sem_chave_valida") geo = g;
        }

        // 2) IBGE / CNEFE (base oficial) — fonte principal
        if (!geo) {
          try {
            geo = await geocodificarCnefe(rua, numero);
          } catch {
            geo = null;
          }
        }

        // 3) OpenStreetMap (reserva) — só a rua (≈), pros poucos que o IBGE não tem
        if (!geo && rua) {
          const canon = await ruaCanonica(rua);
          if (canon) {
            geo = {
              lat: canon.lat,
              lon: canon.lon,
              aprox: true,
              resolvido: `${canon.nome}${numero ? " " + numero : ""} — OpenStreetMap (rua)`,
            };
          }
          await dorme(300);
        }

        cache[end] = geo
          ? { lat: geo.lat, lon: geo.lon, aprox: geo.aprox || undefined, resolvido: geo.resolvido }
          : { semRua: true };
        salvarCache(cache);
      }

      // ===== FASE 2 — CALCULAR A ROTA (km real) dos que foram localizados =====
      // Inclui os que ficaram pendentes de uma tentativa anterior (OSRM instável).
      const paraRotear = unicos.filter((e) => {
        const c = cache[e];
        return !!c && "lat" in c; // tem coordenada, ainda sem km
      });
      let fr = 0;
      for (const end of paraRotear) {
        fr++;
        setStatus(`Calculando rotas (${fr}/${paraRotear.length})...`);
        setProgresso({ feito: fr, total: paraRotear.length });
        const c = cache[end];
        if (!c || !("lat" in c)) continue;
        const km = await rotaKm({ lat: c.lat, lon: c.lon });
        if (km != null) {
          cache[end] = { km, aprox: c.aprox, resolvido: c.resolvido };
          salvarCache(cache);
        }
        // km == null → mantém {lat,lon}; será tentado de novo ao reprocessar
        await dorme(350);
      }

      // 4. Monta o resultado
      const resultado: Corrida[] = brutas.map((b) => {
        const entry = cache[normalizar(b.endereco)];
        if (entry && "km" in entry) {
          return { ...b, km: entry.km, aprox: entry.aprox, resolvido: entry.resolvido };
        }
        if (entry && "lat" in entry) {
          // localizado, mas a rota não fechou (servidor instável) — reprocessar
          return {
            ...b,
            km: null,
            aprox: entry.aprox,
            resolvido: entry.resolvido,
            motivo: "semrota" as const,
          };
        }
        return { ...b, km: null, motivo: "semrua" as const };
      });
      setCorridas(resultado);
      const agora = new Date().toLocaleString("pt-BR");
      setImportadoEm(agora);
      setFase("pronto");
      setStatus("");
      // Salva no banco pra QUALQUER pessoa/computador ver a última importação
      setStatus("Salvando pra todos...");
      const r = await salvarRelatorio(resultado, usuario);
      setStatus("");
      if (r.ok) {
        setImportadoPor(usuario ?? "você");
      } else {
        setErro(
          "O resultado apareceu aqui, mas não consegui salvar pra outras pessoas verem: " +
            r.erro +
            ". Tente anexar de novo."
        );
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
  const semRua = corridas.filter((c) => c.motivo === "semrua"); // rua não existe
  const semRota = corridas.filter((c) => c.motivo === "semrota"); // localizado, falta rota

  const exportCsv = () => {
    const linhas = [
      ["Entregador", "Pedido", "Data/hora", "Endereço (Queóps)", "Endereço interpretado (mapa)", "Km (ida)"].join(";"),
      ...corridas.map((c) =>
        [
          c.entregador,
          c.pedido,
          c.dataHora,
          `"${c.endereco.replace(/"/g, "'")}"`,
          `"${(c.resolvido ?? (c.motivo === "semrua" ? "ENDEREÇO NÃO EXISTE NO MAPA" : "")).replace(/"/g, "'")}"`,
          c.km != null
            ? (c.aprox ? "≈" : "") + c.km.toFixed(2).replace(".", ",")
            : c.motivo === "semrota"
              ? "ROTA NÃO CALCULADA (REPROCESSAR)"
              : "ENDEREÇO NÃO EXISTE",
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
              {importadoEm && (
                <span className="text-xs text-zinc-400">
                  Importado {importadoPor ? `por ${importadoPor} ` : ""}em {importadoEm} · visível
                  pra todos
                </span>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Configuração da chave Google (precisão de porta) */}
      <details className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
        <summary className="cursor-pointer select-none font-medium">
          ⚙ Precisão máxima {temChave ? "— chave Google configurada ✓" : "(configurar chave Google — opcional)"}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            Sem chave, o sistema usa a <strong>base oficial do IBGE</strong> (precisão de porta na
            maioria dos endereços) — não precisa configurar nada. Uma chave do Google Maps só é útil
            se quiser cobrir os poucos endereços que o IBGE não tem. A chave fica salva só neste
            navegador.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Cole a chave da API aqui (AIza...)"
              className="h-8 w-72 rounded border border-zinc-300 px-2"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const k = keyDraft.trim();
                try {
                  if (k) localStorage.setItem(GOOGLE_KEY_LS, k);
                  else localStorage.removeItem(GOOGLE_KEY_LS);
                } catch {
                  // storage indisponível
                }
                setTemChave(!!chaveGoogle());
                setKeyDraft("");
                localStorage.removeItem(CACHE_KEY); // recalcula com a fonte nova
              }}
            >
              {keyDraft.trim() ? "Salvar chave" : temChave ? "Remover chave" : "Salvar"}
            </Button>
          </div>
        </div>
      </details>

      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {fase === "processando" && progresso.total > 20 && (
        <p className="text-xs text-zinc-500">
          Primeiro localizo os endereços (base do IBGE, rápido), depois calculo as rotas.
          Endereços já vistos em relatórios anteriores ficam guardados e saem na hora.
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
                <div className="text-xs text-zinc-500">
                  {semRota.length > 0 ? "Rotas pendentes" : "Não localizados"}
                </div>
                <div
                  className={`text-2xl font-semibold ${
                    semRota.length > 0
                      ? "text-amber-600"
                      : semRua.length
                        ? "text-red-600"
                        : ""
                  }`}
                >
                  {semRota.length > 0 ? semRota.length : semRua.length}
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
                        <td className="px-3 py-1.5">
                          {c.endereco}
                          {/* AVISO vermelho só quando a RUA não existe mesmo */}
                          {c.motivo === "semrua" && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
                              ⚠ endereço não existe no mapa
                            </span>
                          )}
                          {/* Localizado, mas a rota não fechou — reprocessar (não é erro do endereço) */}
                          {c.motivo === "semrota" && (
                            <span
                              className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                              title={c.resolvido ? `Localizado em: ${c.resolvido}` : undefined}
                            >
                              ↻ rota pendente — reprocessar
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {c.km != null ? (
                            <span
                              title={
                                (c.resolvido ? `Mapa usou: ${c.resolvido}` : "") +
                                (c.aprox ? " (aproximado — nº não localizado, usei o meio da rua)" : "")
                              }
                            >
                              {c.aprox ? "≈ " : ""}
                              {c.km.toFixed(2)}
                            </span>
                          ) : c.motivo === "semrota" ? (
                            <span className="text-amber-600 font-medium">↻</span>
                          ) : (
                            <span className="text-red-600 font-medium">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            );
          })}

          {semRota.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ↻ {semRota.length} corrida(s) foram <strong>localizadas</strong>, mas o servidor
              gratuito de rotas engasgou e o km não fechou. <strong>Clique em “Anexar
              relatório” de novo</strong> — só essas serão recalculadas (as demais já estão
              prontas), e devem completar.
            </p>
          )}
          {semRua.length > 0 && (
            <p className="text-xs text-red-600">
              ⚠ {semRua.length} corrida(s) com endereço que não existe no mapa (erro de digitação
              no Queóps) — marcadas na tabela e fora do km total. O CSV traz o texto original pra
              conferência.
            </p>
          )}
        </>
      )}
    </div>
  );
}
