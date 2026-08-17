import Link from "next/link";
import { cn } from "@/lib/utils";

export type ItemHabitual = { produto: string; qtd: number };

// Estado do cliente: forma + cor, pra ler mesmo sem distinguir cores.
const ESTADOS: Record<string, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "● ativo", classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  atrasado: { rotulo: "⚠ atrasado", classe: "bg-amber-50 text-amber-800 border-amber-200" },
  inativo: { rotulo: "✕ inativo", classe: "bg-red-50 text-red-700 border-red-200" },
  sem_padrao: { rotulo: "sem padrão", classe: "bg-zinc-50 text-zinc-500 border-zinc-200" },
};

export function EstadoPill({ status }: { status: string | null }) {
  const e = ESTADOS[status ?? "sem_padrao"] ?? ESTADOS.sem_padrao;
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        e.classe
      )}
    >
      {e.rotulo}
    </span>
  );
}

/** Telefone clicável. Marca quando o DDD foi presumido — nunca esconder isso. */
export function Telefone({
  e164,
  raw,
  presumido,
  canal,
}: {
  e164: string | null;
  raw: string | null;
  presumido: boolean;
  canal: string | null;
}) {
  if (!e164 && !raw) return <span className="text-zinc-400">sem telefone</span>;
  const visivel = formatarTelefone(raw ?? e164 ?? "");
  const href =
    canal === "whatsapp" && e164
      ? `https://wa.me/${e164.replace("+", "")}`
      : e164
        ? `tel:${e164}`
        : undefined;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-zinc-900 hover:underline">
          {canal === "whatsapp" ? "📱" : "☎"} {visivel}
        </a>
      ) : (
        <span>{visivel}</span>
      )}
      {presumido && (
        <span
          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
          title="O DDD 51 foi presumido — confirme antes de ligar."
        >
          DDD presumido
        </span>
      )}
    </span>
  );
}

export function formatarTelefone(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return v;
}

export function ItensHabituais({ itens, max = 3 }: { itens: ItemHabitual[] | null; max?: number }) {
  if (!itens?.length) return null;
  return (
    <span className="text-zinc-600">
      {itens.slice(0, max).map((i) => i.produto).join(" · ")}
    </span>
  );
}

export function LinkCliente({ id, nome }: { id: string; nome: string }) {
  return (
    <Link href={`/vendas/clientes/${id}`} className="font-medium text-zinc-900 hover:underline">
      {nome}
    </Link>
  );
}

// Resultado do contato. Mesma ordem do formulário de registro.
export const RESULTADO_LABEL: Record<string, string> = {
  vai_comprar: "Vai comprar",
  comprou: "Comprou agora",
  nao_agora: "Não agora",
  sem_resposta: "Sem resposta",
  recusou: "Não quer mais",
};

const RESULTADO_CLASSE: Record<string, string> = {
  vai_comprar: "bg-blue-50 text-blue-700 border-blue-200",
  comprou: "bg-emerald-50 text-emerald-700 border-emerald-200",
  nao_agora: "bg-zinc-50 text-zinc-600 border-zinc-200",
  sem_resposta: "bg-amber-50 text-amber-800 border-amber-200",
  recusou: "bg-red-50 text-red-700 border-red-200",
};

export function ResultadoPill({ resultado }: { resultado: string | null }) {
  const r = resultado ?? "";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        RESULTADO_CLASSE[r] ?? "bg-zinc-50 text-zinc-500 border-zinc-200"
      )}
    >
      {RESULTADO_LABEL[r] ?? r ?? "—"}
    </span>
  );
}

/**
 * "Promessa vencida": disse que ia comprar, a data combinada passou e desde o
 * contato não houve compra. É onde o dinheiro escapa sem ninguém perceber.
 */
export function promessaVencida(
  resultado: string | null,
  adiarAte: string | null,
  criadoEm: string,
  ultimaCompra: string | null,
  hoje: string
): boolean {
  if (resultado !== "vai_comprar" || !adiarAte) return false;
  if (adiarAte >= hoje) return false;
  const dia = String(criadoEm).slice(0, 10);
  return !ultimaCompra || ultimaCompra < dia;
}

export function diasTexto(dias: number | null): string {
  if (dias == null) return "—";
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `${dias} dias`;
}

export function recenciaDias(ultima: string | null): number | null {
  if (!ultima) return null;
  const hoje = new Date();
  const d = new Date(ultima + "T00:00:00");
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000);
}
