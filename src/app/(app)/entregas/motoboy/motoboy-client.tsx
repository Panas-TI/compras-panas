"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Sede: Av. Benjamin Constant, 1235 - São João, Porto Alegre
const SEDE = { lat: -30.0071306, lon: -51.1894901 };
// Grupos do relatório que NÃO são corrida de motoboy
const GRUPOS_IGNORADOS = new Set(["BALCÃO", "BALCAO", "CONSUMO INTERNO"]);
// Cache de geocodificação+rota no navegador (endereços repetem toda semana)
const CACHE_KEY = "motoboy-km-cache-v4"; // v4: Google primário + OSM reserva
const RESULTADO_KEY = "motoboy-ultimo-resultado-v1"; // último resultado processado
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

type Corrida = {
  pedido: string;
  dataHora: string;
  entregador: string;
  endereco: string;
  km: number | null; // null = endereço não existe no mapa
  aprox?: boolean; // km aproximado (achou só a rua, sem o número)
  resolvido?: string; // endereço que o mapa efetivamente usou (auditoria)
};

type Fase = "idle" | "processando" | "pronto";

type CacheEntry = { km: number; aprox?: boolean; resolvido?: string } | { falha: true };

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
  BEIJAMIN: "BENJAMIN", BENJAMIM: "BENJAMIN", ADDA: "ADA", CAIRÚ: "CAIRU",
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

// ---------- FASE B: números prediais das ruas (Overpass em lote) ----------
type NumPredial = [numero: number, lat: number, lon: number];

async function numerosDasRuas(nomes: string[]): Promise<Record<string, NumPredial[]>> {
  const out: Record<string, NumPredial[]> = {};
  for (const n of nomes) out[n] = [];
  for (let i = 0; i < nomes.length; i += 20) {
    const lote = nomes.slice(i, i + 20);
    const uniao = lote
      .map((n) => n.replace(/[\\"]/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&"))
      .join("|");
    const q = `[out:json][timeout:50];
(node["addr:housenumber"]["addr:street"~"^(${uniao})$"](-30.32,-51.35,-29.90,-51.00);
 way["addr:housenumber"]["addr:street"~"^(${uniao})$"](-30.32,-51.35,-29.90,-51.00););
out center 4000;`;
    let d: {
      elements?: Array<{
        tags?: Record<string, string>;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
      }>;
    } | null = null;
    for (const host of [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ]) {
      try {
        const resp = await fetch(host, {
          method: "POST",
          body: new URLSearchParams({ data: q }),
        });
        if (resp.ok) {
          d = await resp.json();
          break;
        }
      } catch {
        // tenta o espelho
      }
      await dorme(3000);
    }
    for (const el of d?.elements ?? []) {
      const rua = el.tags?.["addr:street"] ?? "";
      const num = parseInt((el.tags?.["addr:housenumber"] ?? "").replace(/\D/g, ""), 10);
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (rua in out && num > 0 && lat != null && lon != null) out[rua].push([num, lat, lon]);
    }
    await dorme(2000);
  }
  return out;
}

// ---------- FASE C: posição do número (exato → interpolado → vizinho) ----------
function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111320;
  const dLon = (aLon - bLon) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

type Posicao = { lat: number; lon: number; modo: string; aprox: boolean };

function posicaoDoNumero(nums: NumPredial[], ancora: RuaCanonica, alvo: number): Posicao | null {
  // Só números da MESMA rua física (perto do eixo) — mata homônimos de outras cidades
  const perto = nums
    .filter(([, la, lo]) => distM(la, lo, ancora.lat, ancora.lon) < 2500)
    .sort((a, b) => a[0] - b[0]);
  if (perto.length === 0) return null;
  const exato = perto.find(([n]) => n === alvo);
  if (exato) return { lat: exato[1], lon: exato[2], modo: "nº exato", aprox: false };
  const menores = perto.filter(([n]) => n < alvo);
  const maiores = perto.filter(([n]) => n > alvo);
  if (menores.length && maiores.length) {
    const a = menores[menores.length - 1];
    const b = maiores[0];
    const gap = b[0] - a[0];
    if (gap <= 150 && distM(a[1], a[2], b[1], b[2]) <= 900) {
      const f = (alvo - a[0]) / gap;
      return {
        lat: a[1] + f * (b[1] - a[1]),
        lon: a[2] + f * (b[2] - a[2]),
        modo: `interpolado entre nº ${a[0]} e ${b[0]}`,
        aprox: true,
      };
    }
  }
  const viz = perto.reduce((m, p) => (Math.abs(p[0] - alvo) < Math.abs(m[0] - alvo) ? p : m));
  if (Math.abs(viz[0] - alvo) <= 400) {
    return { lat: viz[1], lon: viz[2], modo: `próximo ao nº ${viz[0]}`, aprox: true };
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
  const [temChave, setTemChave] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  // Ao abrir a página, recupera o último resultado processado (persiste
  // entre navegações — não precisa reanexar toda vez que voltar aqui).
  useEffect(() => {
    setTemChave(!!chaveGoogle());
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
      const pendentes = unicos.filter((e) => !cache[e]);

      // ===== CAMINHO 1: Google (precisão de porta) — quando há chave =====
      const key = chaveGoogle();
      if (pendentes.length > 0 && key) {
        let fg = 0;
        for (const end of pendentes) {
          fg++;
          setStatus(`Calculando com Google (${fg}/${pendentes.length})...`);
          setProgresso({ feito: fg, total: pendentes.length });
          let g: GeoGoogle | null | "sem_chave_valida" = await geocodeGoogle(end, key);
          if (g === "sem_chave_valida") {
            setErro(
              "Chave do Google inválida ou sem cota — seguindo no modo gratuito (OpenStreetMap)."
            );
            break;
          }
          if (!g) {
            // 2ª tentativa: endereço limpo (abreviações expandidas, sem complemento)
            const ex = extrair(end);
            if (ex.rua) {
              g = await geocodeGoogle(`${ex.rua}${ex.numero ? " " + ex.numero : ""}`, key);
              if (g === "sem_chave_valida") {
                setErro(
                  "Chave do Google inválida ou sem cota — seguindo no modo gratuito (OpenStreetMap)."
                );
                break;
              }
            }
          }
          if (g) {
            const km = await rotaKm({ lat: g.lat, lon: g.lon });
            cache[end] =
              km != null
                ? { km, aprox: g.aprox || undefined, resolvido: g.resolvido }
                : { falha: true };
          } else {
            cache[end] = { falha: true };
          }
          salvarCache(cache);
          await dorme(120);
        }
      }

      // ===== CAMINHO 2: OpenStreetMap (gratuito) — o que sobrou =====
      const restantes = unicos.filter((e) => !cache[e]);
      if (restantes.length > 0) {
        const alvosPend = restantes.map((end) => ({ end, ...extrair(end) }));

        // FASE A: localizar as ruas (Photon fuzzy, 1/s)
        const ruasBusca = Array.from(new Set(alvosPend.map((a) => a.rua).filter(Boolean)));
        const canonPorBusca: Record<string, RuaCanonica | null> = {};
        let fa = 0;
        for (const rb of ruasBusca) {
          fa++;
          setStatus(`Fase 1/3 — localizando ruas (${fa}/${ruasBusca.length})...`);
          setProgresso({ feito: fa, total: ruasBusca.length });
          canonPorBusca[rb] = await ruaCanonica(rb);
          await dorme(1100);
        }

        // FASE B: números prediais das ruas (Overpass em lotes de 20)
        const nomesCanon = Array.from(
          new Set(
            alvosPend
              .filter((a) => a.numero && canonPorBusca[a.rua])
              .map((a) => canonPorBusca[a.rua]!.nome)
          )
        );
        setStatus(`Fase 2/3 — números prediais de ${nomesCanon.length} ruas (em lotes)...`);
        setProgresso({ feito: 0, total: 0 });
        const numsPorRua = nomesCanon.length ? await numerosDasRuas(nomesCanon) : {};

        // FASE C: posição do número + rota
        let fc = 0;
        for (const a of alvosPend) {
          fc++;
          setStatus(`Fase 3/3 — calculando rotas (${fc}/${alvosPend.length})...`);
          setProgresso({ feito: fc, total: alvosPend.length });
          const canon = a.rua ? canonPorBusca[a.rua] : null;
          if (!canon) {
            cache[a.end] = { falha: true };
            salvarCache(cache);
            continue;
          }
          let pos: Posicao | null = null;
          if (a.numero) {
            pos = posicaoDoNumero(numsPorRua[canon.nome] ?? [], canon, parseInt(a.numero, 10));
          }
          if (!pos) pos = { lat: canon.lat, lon: canon.lon, modo: "meio da rua", aprox: true };
          const km = await rotaKm({ lat: pos.lat, lon: pos.lon });
          cache[a.end] =
            km != null
              ? {
                  km,
                  aprox: pos.aprox || undefined,
                  resolvido: `${canon.nome}${a.numero ? " " + a.numero : ""} — ${pos.modo}`,
                }
              : { falha: true };
          salvarCache(cache);
          await dorme(250); // gentileza com o OSRM
        }
      }

      // 4. Monta o resultado
      const resultado: Corrida[] = brutas.map((b) => {
        const entry = cache[normalizar(b.endereco)];
        return {
          ...b,
          km: entry && "km" in entry ? entry.km : null,
          aprox: entry && "km" in entry ? entry.aprox : undefined,
          resolvido: entry && "km" in entry ? entry.resolvido : undefined,
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
      ["Entregador", "Pedido", "Data/hora", "Endereço (Queóps)", "Endereço interpretado (mapa)", "Km (ida)"].join(";"),
      ...corridas.map((c) =>
        [
          c.entregador,
          c.pedido,
          c.dataHora,
          `"${c.endereco.replace(/"/g, "'")}"`,
          `"${(c.resolvido ?? (c.km == null ? "ENDEREÇO NÃO EXISTE NO MAPA" : "")).replace(/"/g, "'")}"`,
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

      {/* Configuração da chave Google (precisão de porta) */}
      <details className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
        <summary className="cursor-pointer select-none font-medium">
          ⚙ Precisão máxima {temChave ? "— chave Google configurada ✓" : "(configurar chave Google — opcional)"}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            Com uma chave da API do Google Maps, o km é calculado com <strong>precisão de porta</strong>{" "}
            em praticamente todos os endereços (e o processamento cai pra ~2 min). Sem chave, usa o
            OpenStreetMap gratuito (precisão de rua/quadra). A chave fica salva só neste navegador.
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

      {fase === "processando" && progresso.total > 20 && !temChave && (
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
                        <td className="px-3 py-1.5">
                          {c.endereco}
                          {/* AVISO só quando o endereço realmente não existe no mapa */}
                          {c.km == null && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
                              ⚠ endereço não existe no mapa
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

          {falhas.length > 0 && (
            <p className="text-xs text-red-600">
              ⚠ {falhas.length} corrida(s) com endereço que não existe no mapa (erro de digitação
              no Queóps) — marcadas na tabela e fora do km total. O CSV traz o texto original pra
              conferência.
            </p>
          )}
        </>
      )}
    </div>
  );
}
