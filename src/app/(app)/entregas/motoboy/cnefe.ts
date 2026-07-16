// Geocodificação pela base oficial do IBGE (CNEFE Censo 2022, Porto Alegre).
// As ruas (7.635) vêm de /data/ruas_poa.json (carregado no navegador);
// os números prediais (273 mil) vêm da tabela enderecos_poa no Supabase.
// Precisão de porta, grátis, sem cartão, sem limite de requisições.
"use client";

export type GeoCnefe = { lat: number; lon: number; aprox: boolean; resolvido: string };

// Títulos que o Queóps abrevia mas o CNEFE grava por extenso
const ABREV_TITULO: Record<string, string> = {
  DES: "DESEMBARGADOR", ENG: "ENGENHEIRO", GEN: "GENERAL", CEL: "CORONEL",
  DR: "DOUTOR", DRA: "DOUTORA", PROF: "PROFESSOR", MAL: "MARECHAL", MAR: "MARECHAL",
  ALM: "ALMIRANTE", SEN: "SENADOR", PRES: "PRESIDENTE", VISC: "VISCONDE",
  BRIG: "BRIGADEIRO", CAP: "CAPITAO", TEN: "TENENTE", STO: "SANTO", STA: "SANTA",
  PE: "PADRE", MON: "MONSENHOR", DEP: "DEPUTADO", MIN: "MINISTRO", GOV: "GOVERNADOR",
  MAJ: "MAJOR", CMTE: "COMANDANTE", CDOR: "COMENDADOR", VER: "VEREADOR",
};
const PARTIC = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);
// Títulos genéricos (Coronel, Doutor...) NÃO valem como prova de que é a mesma
// rua — "Coronel Ricardo" e "Coronel Fernando" são ruas diferentes. Ficam de
// fora da contagem do núcleo do nome.
const TITULOS = new Set(Object.values(ABREV_TITULO));
const TIPOS = new Set([
  "RUA", "AVENIDA", "TRAVESSA", "ALAMEDA", "PRACA", "ESTRADA", "BECO",
  "ACESSO", "LARGO", "VIA", "RODOVIA", "LADEIRA", "VIELA", "PARQUE",
]);

function semAcento(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// Ruas com data o IBGE grava por extenso ("QUATORZE DE JULHO"), o Queóps
// usa dígito ("14 DE JULHO"). Normaliza os dois lados pra dígito.
const EXTENSO_NUM: Record<string, string> = {
  PRIMEIRO: "1", UM: "1", DOIS: "2", DUAS: "2", TRES: "3", QUATRO: "4",
  CINCO: "5", SEIS: "6", SETE: "7", OITO: "8", NOVE: "9", DEZ: "10",
  ONZE: "11", DOZE: "12", TREZE: "13", QUATORZE: "14", CATORZE: "14",
  QUINZE: "15", DEZESSEIS: "16", DEZASSEIS: "16", DEZESSETE: "17",
  DEZASSETE: "17", DEZOITO: "18", DEZENOVE: "19", DEZANOVE: "19",
  VINTE: "20", TRINTA: "30",
};

// rua → tokens normalizados (sem acento, maiúsculo, títulos por extenso,
// número-data por extenso → dígito, tokens repetidos colapsados)
function tokensRua(rua: string): string[] {
  const brutos = semAcento(rua)
    .toUpperCase()
    .split(/[\s.'’]+/)
    .filter(Boolean)
    .map((t) => ABREV_TITULO[t] ?? EXTENSO_NUM[t] ?? t);
  const out: string[] = [];
  for (const t of brutos) if (out[out.length - 1] !== t) out.push(t);
  return out;
}
function semTipo(toks: string[]): string[] {
  return toks.length > 1 && TIPOS.has(toks[0]) ? toks.slice(1) : toks;
}
function assinatura(toks: string[]): string {
  return [...semTipo(toks)].filter((t) => !PARTIC.has(t)).sort().join(" ");
}

// ---------------- índice das ruas (carregado 1x) ----------------
type RuaInfo = { key: string; lat: number; lon: number };
type Indice = {
  exato: Map<string, RuaInfo>; // "AVENIDA BENJAMIN CONSTANT" → info
  semTipo: Map<string, RuaInfo>; // "BENJAMIN CONSTANT" → info
  assin: Map<string, RuaInfo>; // assinatura ordenada → info
  lista: Array<{ sig: Set<string>; info: RuaInfo }>; // p/ subconjunto
};
let indicePromise: Promise<Indice> | null = null;

async function carregarIndice(): Promise<Indice> {
  if (!indicePromise) {
    indicePromise = (async () => {
      const resp = await fetch("/data/ruas_poa.json");
      const dados = (await resp.json()) as Array<[string, number, number, number]>;
      const idx: Indice = {
        exato: new Map(),
        semTipo: new Map(),
        assin: new Map(),
        lista: [],
      };
      for (const [rua, lat, lon] of dados) {
        const toks = tokensRua(rua);
        const info: RuaInfo = { key: rua, lat, lon };
        const kExato = toks.join(" ");
        if (!idx.exato.has(kExato)) idx.exato.set(kExato, info);
        const kSt = semTipo(toks).join(" ");
        if (!idx.semTipo.has(kSt)) idx.semTipo.set(kSt, info);
        const kAs = assinatura(toks);
        if (!idx.assin.has(kAs)) idx.assin.set(kAs, info);
        idx.lista.push({ sig: new Set(semTipo(toks).filter((t) => !PARTIC.has(t))), info });
      }
      return idx;
    })();
  }
  return indicePromise;
}

function acharRua(idx: Indice, rua: string): RuaInfo | null {
  const toks = tokensRua(rua);
  if (!toks.length) return null;
  const ex = idx.exato.get(toks.join(" "));
  if (ex) return ex;
  const st = idx.semTipo.get(semTipo(toks).join(" "));
  if (st) return st;
  const asg = idx.assin.get(assinatura(toks));
  if (asg) return asg;
  // Última tentativa: melhor sobreposição de tokens (Dice). Cobre:
  //  - relatório com título extra (DOUTOR/CORONEL) que o IBGE não grava
  //  - endereço truncado pelo Queóps (última palavra cortada)
  // Preferência: rua que contém TODOS os tokens do relatório; senão a de
  // maior similaridade, exigindo ao menos 2 tokens em comum e Dice ≥ 0,5.
  const alvo = new Set(semTipo(toks).filter((t) => !PARTIC.has(t)));
  if (!alvo.size) return null;
  // Núcleo = palavras que identificam a rua de verdade (fora títulos genéricos
  // e tipos de via). Evita casar por "Coronel"/"Alameda" que se repetem em
  // ruas diferentes.
  const ehNucleo = (t: string) => !TITULOS.has(t) && !TIPOS.has(t);
  const alvoNucleo = new Set([...alvo].filter(ehNucleo));
  let melhor: { score: number; info: RuaInfo } | null = null;
  for (const { sig, info } of idx.lista) {
    let inter = 0;
    for (const t of alvo) if (sig.has(t)) inter++;
    if (!inter) continue;
    // GATE de segurança: o núcleo do nome precisa bater em ≥2 palavras.
    let nucleoInter = 0;
    for (const t of alvoNucleo) if (sig.has(t)) nucleoInter++;
    if (nucleoInter < 2) continue;
    const dice = (2 * inter) / (alvo.size + sig.size);
    const cobreTudo = inter === alvo.size; // relatório ⊂ rua
    if (!cobreTudo && dice < 0.5) continue;
    const score = (cobreTudo ? 1000 : 0) + dice * 100 - sig.size * 0.01;
    if (!melhor || score > melhor.score) melhor = { score, info };
  }
  return melhor?.info ?? null;
}

// ---------------- números da rua (Supabase, cache por rua) ----------------
const numerosCache = new Map<string, Array<[number, number, number]>>();

async function numerosDaRua(ruaKey: string): Promise<Array<[number, number, number]>> {
  const cache = numerosCache.get(ruaKey);
  if (cache) return cache;
  let lista: Array<[number, number, number]> = [];
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const url =
      `${base}/rest/v1/enderecos_poa?select=numero,lat,lon&order=numero&rua=eq.` +
      encodeURIComponent(ruaKey);
    const resp = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (resp.ok) {
      const data = (await resp.json()) as Array<{ numero: number; lat: number; lon: number }>;
      lista = data.map((r) => [r.numero, r.lat, r.lon]);
    }
  } catch {
    // rede/base indisponível → sem números; cai pro centro da rua
  }
  numerosCache.set(ruaKey, lista);
  return lista;
}

function posicao(
  nums: Array<[number, number, number]>,
  alvo: number
): { lat: number; lon: number; modo: string } | null {
  if (!nums.length) return null;
  const exato = nums.find(([n]) => n === alvo);
  if (exato) return { lat: exato[1], lon: exato[2], modo: "porta exata (IBGE)" };
  const menores = nums.filter(([n]) => n < alvo);
  const maiores = nums.filter(([n]) => n > alvo);
  if (menores.length && maiores.length) {
    const a = menores[menores.length - 1];
    const b = maiores[0];
    if (b[0] - a[0] <= 40) {
      const f = (alvo - a[0]) / (b[0] - a[0]);
      return {
        lat: a[1] + f * (b[1] - a[1]),
        lon: a[2] + f * (b[2] - a[2]),
        modo: `interpolado IBGE (${a[0]}–${b[0]})`,
      };
    }
  }
  const todos = [...menores, ...maiores];
  if (todos.length) {
    const viz = todos.reduce((m, p) => (Math.abs(p[0] - alvo) < Math.abs(m[0] - alvo) ? p : m));
    if (Math.abs(viz[0] - alvo) <= 50) {
      return { lat: viz[1], lon: viz[2], modo: `próximo IBGE nº ${viz[0]}` };
    }
  }
  return null;
}

// ---------------- API principal ----------------
export async function geocodificarCnefe(
  rua: string,
  numero: string | null
): Promise<GeoCnefe | null> {
  const idx = await carregarIndice();
  const info = acharRua(idx, rua);
  if (!info) return null; // rua não existe na base oficial → deixa o OSM tentar
  if (numero) {
    const nums = await numerosDaRua(info.key);
    const pos = posicao(nums, parseInt(numero, 10));
    if (pos) {
      return {
        lat: pos.lat,
        lon: pos.lon,
        aprox: !pos.modo.startsWith("porta exata"),
        resolvido: `${info.key} ${numero} — ${pos.modo}`,
      };
    }
  }
  // rua achada, número não → centro da rua (aproximado)
  return {
    lat: info.lat,
    lon: info.lon,
    aprox: true,
    resolvido: `${info.key}${numero ? " " + numero : ""} — meio da rua (IBGE)`,
  };
}
