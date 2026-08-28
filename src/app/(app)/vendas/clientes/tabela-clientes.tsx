"use client";

import { useMemo, useState } from "react";
import { BotaoHoje } from "./botao-hoje";

/** Busca sem acento: "portena" tem que achar "PORTEÑA". */
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
import {
  EstadoPill,
  Telefone,
  LinkCliente,
  ResultadoPill,
  FrequenciaPill,
  FREQUENCIA,
  diasTexto,
  recenciaDias,
} from "../ui";
import type { ItemHabitual } from "../ui";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

export type UltimoContato = {
  resultado: string | null;
  adiar_ate: string | null;
  criado_em: string;
};

export type LinhaCliente = {
  id: string;
  nome: string;
  status: string;
  telefone_e164: string | null;
  telefone_raw: string | null;
  telefone_presumido: boolean;
  canal_preferido: string | null;
  ultima_compra: string | null;
  intervalo_mediano_dias: number | null;
  frequencia_compras: number;
  ticket_medio: number;
  total_vendas: number;
  receita_anual_risco: number | null;
  frequencia_classe: string | null;
  itens_habituais: ItemHabitual[] | null;
  verificar: boolean;
};

type Ordem = "total" | "risco" | "recencia" | "nome" | "ticket";

const ORDENS: { v: Ordem; label: string }[] = [
  { v: "total", label: "Total comprado" },
  { v: "risco", label: "Receita anual em risco" },
  { v: "recencia", label: "Mais parado" },
  { v: "ticket", label: "Ticket médio" },
  { v: "nome", label: "Nome" },
];

export function TabelaClientes({
  clientes,
  estadoInicial = "todos",
  titulo,
  ultimoContato = {},
  naFilaDeHoje = [],
  podeEscrever = false,
}: {
  clientes: LinhaCliente[];
  estadoInicial?: string;
  titulo?: string;
  ultimoContato?: Record<string, UltimoContato>;
  /** Quem já foi puxado à mão para o atendimento de hoje. */
  naFilaDeHoje?: string[];
  podeEscrever?: boolean;
}) {
  const fila = new Set(naFilaDeHoje);
  const [busca, setBusca] = useState("");
  const [estado, setEstado] = useState(estadoInicial);
  const [ordem, setOrdem] = useState<Ordem>(estadoInicial === "inativo" ? "risco" : "total");
  const [soSemContato, setSoSemContato] = useState(false);
  const [freq, setFreq] = useState("todas");

  const filtrados = useMemo(() => {
    const q = semAcento(busca);
    // Só compara telefone quando a busca TEM dígito.
    //
    // Antes: `telefone.includes(q.replace(/\D/g, ""))`. Buscar "mester" deixava
    // o lado direito como string vazia, e "qualquer coisa".includes("") é
    // sempre true — então todo cliente casava e a busca por nome não filtrava
    // nada. O sintoma era a lista inteira aparecendo como se nada tivesse sido
    // digitado.
    const digitos = busca.replace(/\D/g, "");
    const out = clientes.filter((c) => {
      if (estado !== "todos" && c.status !== estado) return false;
      if (soSemContato && ultimoContato[c.id]) return false;
      if (freq !== "todas" && c.frequencia_classe !== freq) return false;
      if (!q) return true;
      return (
        semAcento(c.nome).includes(q) ||
        (digitos.length >= 3 &&
          `${c.telefone_raw ?? ""}${c.telefone_e164 ?? ""}`.replace(/\D/g, "").includes(digitos)) ||
        (c.itens_habituais ?? []).some((i) => semAcento(i.produto).includes(q))
      );
    });
    const rec = (c: LinhaCliente) => recenciaDias(c.ultima_compra) ?? -1;
    out.sort((a, b) => {
      switch (ordem) {
        case "nome": return a.nome.localeCompare(b.nome, "pt-BR");
        case "risco": return Number(b.receita_anual_risco ?? 0) - Number(a.receita_anual_risco ?? 0);
        case "recencia": return rec(b) - rec(a);
        case "ticket": return Number(b.ticket_medio) - Number(a.ticket_medio);
        default: return Number(b.total_vendas) - Number(a.total_vendas);
      }
    });
    return out;
  }, [clientes, busca, estado, ordem, soSemContato, freq, ultimoContato]);

  const semContato = clientes.filter((c) => !ultimoContato[c.id]).length;

  const somaRisco = filtrados.reduce((s, c) => s + Number(c.receita_anual_risco ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, telefone ou produto..."
          className="h-9 min-w-[260px] flex-1 rounded-md border border-zinc-300 px-3 text-sm"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="todos">Todos os estados</option>
          <option value="ativo">Ativos</option>
          <option value="atrasado">Atrasados</option>
          <option value="inativo">Inativos</option>
          <option value="sem_padrao">Sem padrão</option>
        </select>
        <select
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="todas">Toda frequência</option>
          {Object.entries(FREQUENCIA).map(([v, f]) => (
            <option key={v} value={v}>
              {f.rotulo} — {f.desc}
            </option>
          ))}
        </select>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
        >
          {ORDENS.map((o) => (
            <option key={o.v} value={o.v}>Ordenar: {o.label}</option>
          ))}
        </select>
        {semContato > 0 && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={soSemContato}
              onChange={(e) => setSoSemContato(e.target.checked)}
            />
            Nunca contatados ({semContato})
          </label>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        {filtrados.length} de {clientes.length} clientes
        {titulo === "inativos" && somaRisco > 0 && (
          <> · <strong className="text-zinc-700">{formatCurrencyBRL(somaRisco)}/ano</strong> em risco</>
        )}
      </p>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Frequência</th>
              <th className="px-3 py-2">Última compra</th>
              <th className="px-3 py-2 text-right">Ciclo</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
              <th className="px-3 py-2 text-right">Ticket</th>
              <th className="px-3 py-2 text-right">Total</th>
              {titulo === "inativos" && <th className="px-3 py-2 text-right">Risco/ano</th>}
              <th className="px-3 py-2">Último contato</th>
              <th className="px-3 py-2">Telefone</th>
              {podeEscrever && <th className="px-3 py-2">Hoje</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const rec = recenciaDias(c.ultima_compra);
              return (
                <tr key={c.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <LinkCliente id={c.id} nome={c.nome} />
                    {c.verificar && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                        verificar
                      </span>
                    )}
                    {c.itens_habituais?.[0] && (
                      <div className="text-xs text-zinc-400">{c.itens_habituais[0].produto}</div>
                    )}
                  </td>
                  <td className="px-3 py-2"><EstadoPill status={c.status} /></td>
                  <td className="px-3 py-2"><FrequenciaPill classe={c.frequencia_classe} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {c.ultima_compra ? formatDateBR(c.ultima_compra) : "—"}
                    <span className="ml-1 text-xs text-zinc-400">({diasTexto(rec)})</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {c.intervalo_mediano_dias ? `${c.intervalo_mediano_dias}d` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.frequencia_compras}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyBRL(Number(c.ticket_medio))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatCurrencyBRL(Number(c.total_vendas))}
                  </td>
                  {titulo === "inativos" && (
                    <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                      {c.receita_anual_risco ? formatCurrencyBRL(Number(c.receita_anual_risco)) : "—"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2">
                    {(() => {
                      const uc = ultimoContato[c.id];
                      if (!uc) return <span className="text-xs text-zinc-300">nunca</span>;
                      return (
                        <span className="inline-flex flex-col gap-0.5">
                          <ResultadoPill resultado={uc.resultado} />
                          <span className="text-[11px] text-zinc-400">
                            {formatDateBR(String(uc.criado_em).slice(0, 10))}
                          </span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <Telefone
                      e164={c.telefone_e164}
                      raw={c.telefone_raw}
                      presumido={c.telefone_presumido}
                      canal={c.canal_preferido}
                    />
                  </td>
                                  {podeEscrever && (
                    <td className="px-3 py-2">
                      <BotaoHoje clienteId={c.id} jaNaFila={fila.has(c.id)} podeEscrever />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
