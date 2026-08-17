"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import {
  CAMPOS_IMPORT,
  sugerirMapeamento,
  type ChaveCampo,
  type LinhaBruta,
  type Mapeamento,
} from "./lib";
import {
  analisarImportacaoAction,
  gravarImportacaoAction,
  type ResultadoImport,
} from "./actions";

type Etapa = "arquivo" | "mapear" | "previa" | "pronto";

export function Importador({ mapeamentoSalvo }: { mapeamentoSalvo: Mapeamento | null }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [arquivoNome, setArquivoNome] = useState("");
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<LinhaBruta[]>([]);
  const [map, setMap] = useState<Mapeamento>({});
  const [res, setRes] = useState<ResultadoImport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const lerArquivo = async (file: File) => {
    setErro(null);
    setRes(null);
    try {
      const buf = await file.arrayBuffer();
      // cellDates: deixa o SheetJS resolver o serial de data do Excel.
      const wb = XLSX.read(buf, { cellDates: true });
      const aba = wb.Sheets[wb.SheetNames[0]];
      if (!aba) throw new Error("A planilha está vazia.");
      const dados = XLSX.utils.sheet_to_json<LinhaBruta>(aba, { defval: "", raw: false });
      if (dados.length === 0) throw new Error("Nenhuma linha de dados encontrada.");

      const cols = Object.keys(dados[0]);
      setCabecalhos(cols);
      setLinhas(dados);
      setArquivoNome(file.name);

      // Mapeamento salvo só serve se as colunas ainda existirem no arquivo.
      const salvoValido =
        mapeamentoSalvo &&
        Object.values(mapeamentoSalvo).every((c) => !c || cols.includes(c as string));
      setMap(salvoValido ? mapeamentoSalvo! : sugerirMapeamento(cols));
      setEtapa("mapear");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
  };

  const faltando = CAMPOS_IMPORT.filter((c) => c.obrigatorio && !map[c.chave]);

  const analisar = () => {
    setErro(null);
    iniciar(async () => {
      const r = await analisarImportacaoAction(linhas, map);
      if (r.error) return setErro(r.error);
      setRes(r);
      setEtapa("previa");
    });
  };

  const gravar = () => {
    const p = res?.previa;
    if (!p) return;
    if (!confirm(`Confirma importar ${p.pedidosNovos} pedidos novos? A carteira será recalculada.`))
      return;
    setErro(null);
    iniciar(async () => {
      const r = await gravarImportacaoAction(linhas, map, arquivoNome);
      if (r.error) return setErro(r.error);
      setRes(r);
      setEtapa("pronto");
      router.refresh();
    });
  };

  const recomecar = () => {
    setEtapa("arquivo");
    setLinhas([]);
    setCabecalhos([]);
    setRes(null);
    setErro(null);
    setArquivoNome("");
  };

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {etapa === "arquivo" && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div>
              <h2 className="text-sm font-semibold">1. Escolha o arquivo</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Exportação de vendas do ERP em Excel (.xlsx, .xls) ou CSV. Uma linha por pedido ou
                uma por item — o sistema agrupa sozinho.
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) lerArquivo(f);
              }}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-50"
            />
          </CardContent>
        </Card>
      )}

      {etapa === "mapear" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-sm font-semibold">2. Confira o de-para das colunas</h2>
              <p className="mt-1 text-sm text-zinc-600">
                <strong>{arquivoNome}</strong> · {linhas.length} linhas · {cabecalhos.length}{" "}
                colunas. Adivinhei pelos títulos — corrija o que estiver errado.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_IMPORT.map((campo) => (
                <label key={campo.chave} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-700">
                    {campo.rotulo}
                    {campo.obrigatorio ? (
                      <span className="text-red-600"> *</span>
                    ) : (
                      <span className="text-zinc-400"> (opcional)</span>
                    )}
                  </span>
                  <select
                    value={map[campo.chave] ?? ""}
                    onChange={(e) =>
                      setMap((m) => ({
                        ...m,
                        [campo.chave as ChaveCampo]: e.target.value || undefined,
                      }))
                    }
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
                  >
                    <option value="">— não usar —</option>
                    {cabecalhos.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <p className="text-xs text-zinc-500">
              Sem mapear <strong>Produto</strong> a importação grava os pedidos, mas não atualiza o
              &ldquo;costuma levar&rdquo; dos clientes.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={analisar} disabled={pendente || faltando.length > 0}>
                {pendente ? "Analisando…" : "Analisar arquivo"}
              </Button>
              <Button variant="ghost" onClick={recomecar}>
                Trocar arquivo
              </Button>
              {faltando.length > 0 && (
                <span className="text-xs text-amber-700">
                  Falta mapear: {faltando.map((f) => f.rotulo).join(", ")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {etapa === "previa" && res?.previa && (
        <PreviaImport
          previa={res.previa}
          pendente={pendente}
          onConfirmar={gravar}
          onVoltar={() => setEtapa("mapear")}
        />
      )}

      {etapa === "pronto" && res?.gravado && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <h2 className="text-base font-semibold text-emerald-700">✓ Importado</h2>
            <p className="text-sm text-zinc-700">
              <strong>{res.gravado.pedidosNovos}</strong> pedidos novos ·{" "}
              <strong>{res.gravado.clientesNovos}</strong> clientes novos ·{" "}
              <strong>{res.gravado.itensNovos}</strong> itens. A carteira foi recalculada.
            </p>
            {res.gravado.clientesNovos > 0 && (
              <p className="text-sm text-amber-800">
                Os {res.gravado.clientesNovos} clientes novos entraram marcados como
                &ldquo;verificar&rdquo; — falta telefone e endereço pra poder contatá-los.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => router.push("/vendas")}>Ver a fila de hoje</Button>
              <Button variant="outline" onClick={recomecar}>
                Importar outro arquivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviaImport({
  previa,
  pendente,
  onConfirmar,
  onVoltar,
}: {
  previa: NonNullable<ResultadoImport["previa"]>;
  pendente: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const nada = previa.pedidosNovos === 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">3. Confira antes de gravar</h2>
          {previa.periodo && (
            <p className="mt-1 text-sm text-zinc-600">
              Período do arquivo: {formatDateBR(previa.periodo.inicio)} a{" "}
              {formatDateBR(previa.periodo.fim)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi rotulo="Pedidos novos" valor={String(previa.pedidosNovos)} destaque />
          <Kpi rotulo="Já existiam" valor={String(previa.pedidosJaExistiam)} />
          <Kpi rotulo="Clientes novos" valor={String(previa.clientesNovos.length)} />
          <Kpi rotulo="Valor dos novos" valor={formatCurrencyBRL(previa.valorTotal)} />
        </div>

        {previa.pedidosJaExistiam > 0 && (
          <p className="text-sm text-zinc-600">
            {previa.pedidosJaExistiam} pedidos do arquivo já estavam no sistema e serão ignorados —
            reimportar a mesma semana não duplica nada.
          </p>
        )}

        {previa.clientesNovos.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>{previa.clientesNovos.length} clientes não estão na carteira</strong> e serão
            criados marcados pra conferência:
            <ul className="ml-4 mt-1 list-disc">
              {previa.clientesNovos.slice(0, 10).map((n) => (
                <li key={n}>{n}</li>
              ))}
              {previa.clientesNovos.length > 10 && (
                <li>e mais {previa.clientesNovos.length - 10}…</li>
              )}
            </ul>
          </div>
        )}

        {previa.linhasRejeitadas.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>{previa.linhasRejeitadas.length} linhas não puderam ser lidas</strong> e ficarão
            de fora:
            <ul className="ml-4 mt-1 list-disc">
              {previa.linhasRejeitadas.slice(0, 5).map((r) => (
                <li key={r.linha}>
                  linha {r.linha} — {r.motivo}
                </li>
              ))}
              {previa.linhasRejeitadas.length > 5 && (
                <li>e mais {previa.linhasRejeitadas.length - 5}…</li>
              )}
            </ul>
            <p className="mt-1 text-xs">
              Se forem muitas, provavelmente o de-para está errado — volte e confira.
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Amostra do que foi lido</p>
          <div className="overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5">Pedido</th>
                  <th className="px-2 py-1.5">Data</th>
                  <th className="px-2 py-1.5">Cliente</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5">Situação</th>
                </tr>
              </thead>
              <tbody>
                {previa.amostra.map((a) => (
                  <tr key={a.pedido} className="border-t border-zinc-100">
                    <td className="px-2 py-1.5 font-mono text-xs">{a.pedido}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{formatDateBR(a.data)}</td>
                    <td className="px-2 py-1.5">{a.cliente}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCurrencyBRL(a.total)}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {a.novo ? (
                        <span className="text-emerald-700">novo</span>
                      ) : (
                        <span className="text-zinc-400">já existe</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirmar} disabled={pendente || nada}>
            {pendente ? "Gravando…" : `Confirmar e importar ${previa.pedidosNovos} pedidos`}
          </Button>
          <Button variant="ghost" onClick={onVoltar}>
            Voltar ao de-para
          </Button>
          {nada && (
            <span className="self-center text-sm text-zinc-500">
              Nada novo pra importar neste arquivo.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="text-xs text-zinc-500">{rotulo}</div>
      <div
        className={`text-xl font-semibold tabular-nums ${destaque ? "text-emerald-700" : "text-zinc-900"}`}
      >
        {valor}
      </div>
    </div>
  );
}
