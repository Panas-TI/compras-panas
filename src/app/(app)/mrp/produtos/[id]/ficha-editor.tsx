"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { salvarFichaAction, type LinhaFichaInput } from "../actions";

export type MpOpcao = {
  id: string;
  codigo: string | null;
  nome: string;
  unidade: string;
  tipo: "folha" | "intermediario" | "ignorado";
  temItemCompra: boolean;
};

export type LinhaInicial = {
  materia_prima_id: string;
  quantidade: number;
  merma_percent: number;
  observacoes: string | null;
  mpNome: string;
  mpCodigo: string | null;
  mpUnidade: string;
};

type LinhaState = LinhaInicial & {
  _key: string; // chave estável pra re-render (não usa id porque pode ser nova)
};

function gerarKey() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtDataBR(iso: string | null) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function FichaEditor({
  produtoId,
  unidadeProducao,
  versaoAtual,
  dataVigenciaInicio,
  linhasIniciais,
  mpOpcoes,
  observacoesIniciais,
}: {
  produtoId: string;
  unidadeProducao: string;
  versaoAtual: number | null;
  dataVigenciaInicio: string | null;
  linhasIniciais: LinhaInicial[];
  mpOpcoes: MpOpcao[];
  observacoesIniciais: string;
}) {
  const [linhas, setLinhas] = useState<LinhaState[]>(
    linhasIniciais.map((l) => ({ ...l, _key: gerarKey() }))
  );
  const [observacoes, setObservacoes] = useState(observacoesIniciais);
  const [salvando, startSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Detecta mudanças vs estado inicial
  const tocou = useMemo(() => {
    if (linhas.length !== linhasIniciais.length) return true;
    if (observacoes !== observacoesIniciais) return true;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const orig = linhasIniciais[i];
      if (!orig) return true;
      if (l.materia_prima_id !== orig.materia_prima_id) return true;
      if (Number(l.quantidade) !== Number(orig.quantidade)) return true;
      if (Number(l.merma_percent) !== Number(orig.merma_percent)) return true;
      if ((l.observacoes ?? "") !== (orig.observacoes ?? "")) return true;
    }
    return false;
  }, [linhas, observacoes, linhasIniciais, observacoesIniciais]);

  const updateLinha = (key: string, patch: Partial<LinhaState>) => {
    setLinhas((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };

  const removerLinha = (key: string) => {
    setLinhas((ls) => ls.filter((l) => l._key !== key));
  };

  const adicionarLinha = () => {
    setLinhas((ls) => [
      ...ls,
      {
        _key: gerarKey(),
        materia_prima_id: "",
        quantidade: 0,
        merma_percent: 0,
        observacoes: null,
        mpNome: "",
        mpCodigo: null,
        mpUnidade: "",
      },
    ]);
  };

  const trocarMp = (key: string, novoMpId: string) => {
    const mp = mpOpcoes.find((m) => m.id === novoMpId);
    if (!mp) return;
    updateLinha(key, {
      materia_prima_id: novoMpId,
      mpNome: mp.nome,
      mpCodigo: mp.codigo,
      mpUnidade: mp.unidade,
    });
  };

  const salvar = () => {
    setErro(null);
    setOk(null);
    const payload: LinhaFichaInput[] = linhas.map((l) => ({
      materia_prima_id: l.materia_prima_id,
      quantidade: Number(l.quantidade),
      merma_percent: Number(l.merma_percent),
      observacoes: l.observacoes,
    }));
    startSalvar(async () => {
      const res = await salvarFichaAction(produtoId, payload, observacoes);
      if (res.error) {
        setErro(res.error);
        return;
      }
      const novaVersao = (versaoAtual ?? 0) + 1;
      setOk(`Nova versão (v${novaVersao}) criada com sucesso.`);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Ficha técnica{" "}
          {versaoAtual && (
            <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
              v{versaoAtual}
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Vigente desde {fmtDataBR(dataVigenciaInicio)}. Quantidades pra produzir{" "}
          <strong>1 {unidadeProducao}</strong>. Salvar cria nova versão (preserva histórico).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-2 py-1 font-medium">#</th>
                <th className="px-2 py-1 font-medium">Matéria-prima</th>
                <th className="px-2 py-1 font-medium">Qtd</th>
                <th className="px-2 py-1 font-medium">Un.</th>
                <th className="px-2 py-1 font-medium">Merma %</th>
                <th className="px-2 py-1 font-medium">Obs.</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const mpAtual = mpOpcoes.find((m) => m.id === l.materia_prima_id);
                return (
                  <tr key={l._key} className="border-t border-zinc-100">
                    <td className="px-2 py-1 text-xs text-zinc-500">{i + 1}</td>
                    <td className="px-2 py-1">
                      <select
                        value={l.materia_prima_id}
                        onChange={(e) => trocarMp(l._key, e.target.value)}
                        className="w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs"
                      >
                        <option value="">— Selecione —</option>
                        {mpOpcoes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.codigo ?? "—"} · {m.nome} ({m.unidade}){" "}
                            {m.tipo === "intermediario" ? " [intermediário]" : ""}
                            {m.tipo === "ignorado" ? " [ignorado]" : ""}
                          </option>
                        ))}
                      </select>
                      {mpAtual && !mpAtual.temItemCompra && mpAtual.tipo === "folha" && (
                        <p className="mt-0.5 text-[10px] text-amber-700">
                          ⚠ sem item de compra vinculado
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.000001"
                        value={l.quantidade}
                        onChange={(e) =>
                          updateLinha(l._key, { quantidade: Number(e.target.value) })
                        }
                        className="w-24 rounded border border-zinc-300 bg-white px-1 py-1 text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1 text-xs text-zinc-600">{l.mpUnidade || "—"}</td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={100}
                        value={l.merma_percent}
                        onChange={(e) =>
                          updateLinha(l._key, { merma_percent: Number(e.target.value) })
                        }
                        className="w-16 rounded border border-zinc-300 bg-white px-1 py-1 text-xs tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={l.observacoes ?? ""}
                        onChange={(e) => updateLinha(l._key, { observacoes: e.target.value || null })}
                        className="w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removerLinha(l._key)}
                        className="text-xs text-red-700 hover:underline"
                        title="Remover linha"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-xs text-zinc-500">
                    Ficha vazia. Clica em &ldquo;+ Adicionar linha&rdquo; pra começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={adicionarLinha}
            className="text-xs text-zinc-700 hover:underline"
          >
            + Adicionar linha
          </button>
          <span className="text-xs text-zinc-500">
            {linhas.length} {linhas.length === 1 ? "linha" : "linhas"}
          </span>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600">Observações da versão</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            placeholder="Ex: Ajuste de receita após teste de produção. Reduzi 5% de margarina."
          />
        </div>

        {erro && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            ⚠ {erro}
          </div>
        )}
        {ok && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            ✓ {ok}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
          <Button onClick={salvar} disabled={!tocou || salvando}>
            {salvando ? "Salvando…" : tocou ? "Salvar nova versão" : "Sem mudanças"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
