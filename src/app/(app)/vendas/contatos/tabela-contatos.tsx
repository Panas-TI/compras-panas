"use client";

import { useMemo, useState } from "react";
import {
  LinkCliente,
  ResultadoPill,
  MotivoTag,
  MOTIVOS_CONTATO,
  RESULTADO_LABEL,
  promessaVencida,
} from "../ui";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

export type LinhaContato = {
  id: string;
  canal: string | null;
  resultado: string | null;
  motivo: string | null;
  observacao: string | null;
  adiar_ate: string | null;
  criado_em: string;
  usuario: { nome: string | null } | null;
  cliente: {
    id: string;
    nome: string;
    ultima_compra: string | null;
    ticket_medio: number | null;
  } | null;
};

const PERIODOS = [
  { v: "7", label: "Últimos 7 dias" },
  { v: "30", label: "Últimos 30 dias" },
  { v: "90", label: "Últimos 90 dias" },
  { v: "todos", label: "Todo o período" },
] as const;

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function TabelaContatos({
  contatos,
  hoje,
  totalNoBanco,
}: {
  contatos: LinhaContato[];
  hoje: string;
  totalNoBanco: number;
}) {
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState("todos");
  const [motivo, setMotivo] = useState("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [periodo, setPeriodo] = useState<string>("30");
  const [soPendentes, setSoPendentes] = useState(false);

  const vendedores = useMemo(() => {
    const s = new Set<string>();
    for (const c of contatos) if (c.usuario?.nome) s.add(c.usuario.nome);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contatos]);

  // Promessa vencida: disse "vai comprar", a data passou e não comprou desde então.
  const vencidas = useMemo(
    () =>
      contatos.filter((c) =>
        promessaVencida(
          c.resultado,
          c.adiar_ate,
          c.criado_em,
          c.cliente?.ultima_compra ?? null,
          hoje
        )
      ),
    [contatos, hoje]
  );
  const idsVencidas = useMemo(() => new Set(vencidas.map((c) => c.id)), [vencidas]);
  const valorEmRisco = vencidas.reduce((s, c) => s + Number(c.cliente?.ticket_medio ?? 0), 0);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const desde = periodo === "todos" ? null : diasAtras(Number(periodo));
    return contatos.filter((c) => {
      if (soPendentes && !idsVencidas.has(c.id)) return false;
      if (resultado !== "todos" && c.resultado !== resultado) return false;
      if (motivo !== "todos" && c.motivo !== motivo) return false;
      if (vendedor !== "todos" && (c.usuario?.nome ?? "") !== vendedor) return false;
      if (desde && String(c.criado_em).slice(0, 10) < desde) return false;
      if (!q) return true;
      return (
        (c.cliente?.nome ?? "").toLowerCase().includes(q) ||
        (c.observacao ?? "").toLowerCase().includes(q) ||
        (c.motivo ?? "").toLowerCase().includes(q)
      );
    });
  }, [contatos, busca, resultado, motivo, vendedor, periodo, soPendentes, idsVencidas]);

  // Ranking do que os clientes mais dizem — é pra isso que o motivo é fechado.
  const topMotivos = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtrados) if (c.motivo) m.set(c.motivo, (m.get(c.motivo) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

  // Contadores do recorte atual — úteis pra ler o funil da semana.
  const porResultado = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtrados) m.set(c.resultado ?? "", (m.get(c.resultado ?? "") ?? 0) + 1);
    return m;
  }, [filtrados]);

  return (
    <div className="flex flex-col gap-3">
      {vencidas.length > 0 && (
        <button
          type="button"
          onClick={() => setSoPendentes((v) => !v)}
          className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
            soPendentes
              ? "border-amber-400 bg-amber-100 text-amber-950"
              : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
          }`}
        >
          <strong>
            {vencidas.length} {vencidas.length === 1 ? "promessa vencida" : "promessas vencidas"}
          </strong>{" "}
          — disseram que iam comprar, a data passou e não compraram
          {valorEmRisco > 0 && <> · {formatCurrencyBRL(valorEmRisco)} em ticket</>}
          <span className="ml-1 text-xs opacity-70">
            ({soPendentes ? "clique pra ver todos" : "clique pra filtrar"})
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente ou observação..."
          className="h-9 min-w-[240px] flex-1 rounded-md border border-zinc-300 px-3 text-sm"
        />
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          {PERIODOS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="todos">Todos os resultados</option>
          {Object.entries(RESULTADO_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="todos">Todos os motivos</option>
          {MOTIVOS_CONTATO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {vendedores.length > 1 && (
          <select
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
          >
            <option value="todos">Todos os vendedores</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>
          {filtrados.length} de {totalNoBanco} contatos
        </span>
        {Object.entries(RESULTADO_LABEL).map(([v, label]) =>
          porResultado.get(v) ? (
            <span key={v}>
              · {label}: <strong className="text-zinc-700">{porResultado.get(v)}</strong>
            </span>
          ) : null
        )}
      </p>

      {topMotivos.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            O que os clientes mais disseram neste recorte
          </p>
          <div className="flex flex-wrap gap-2">
            {topMotivos.map(([m, n]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(motivo === m ? "todos" : m)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  motivo === m
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {m} <strong className="tabular-nums">{n}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Resultado</th>
              <th className="px-3 py-2">O que disse</th>
              <th className="px-3 py-2">Volta em</th>
              <th className="px-3 py-2">Detalhe</th>
              <th className="px-3 py-2">Quem falou</th>
              <th className="px-3 py-2">Canal</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const vencida = idsVencidas.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={`border-b border-zinc-50 last:border-0 hover:bg-zinc-50 ${
                    vencida ? "bg-amber-50/50" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {formatDateBR(String(c.criado_em).slice(0, 10))}
                    <span className="ml-1 text-xs text-zinc-400">
                      {String(c.criado_em).slice(11, 16)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {c.cliente ? (
                      <LinkCliente id={c.cliente.id} nome={c.cliente.nome} />
                    ) : (
                      <span className="text-zinc-400">(cliente removido)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ResultadoPill resultado={c.resultado} />
                  </td>
                  <td className="px-3 py-2">
                    <MotivoTag motivo={c.motivo} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {c.adiar_ate ? (
                      vencida ? (
                        <span className="font-medium text-amber-800" title="Data combinada já passou e não houve compra">
                          ⚠ {formatDateBR(c.adiar_ate)}
                        </span>
                      ) : (
                        formatDateBR(c.adiar_ate)
                      )
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {c.observacao ? `“${c.observacao}”` : <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {c.usuario?.nome ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{c.canal ?? "—"}</td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-zinc-500">
                  Nenhum contato com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
