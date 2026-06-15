"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ativarVersaoAntigaAction } from "../actions";

type Versao = {
  id: string;
  versao: number;
  data_vigencia_inicio: string;
  data_vigencia_fim: string | null;
  vigente: boolean;
  observacoes: string | null;
  criado_em: string;
};

function fmtBR(iso: string | null) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function HistoricoVersoes({ produtoId, versoes }: { produtoId: string; versoes: Versao[] }) {
  const [aberto, setAberto] = useState(false);
  const [reativando, startReativar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (versoes.length <= 1) return null;

  const naoVigentes = versoes.filter((v) => !v.vigente);
  if (naoVigentes.length === 0) return null;

  const reativar = (fichaId: string, versao: number) => {
    if (!window.confirm(`Reativar versão v${versao}? A versão vigente atual ficará arquivada.`)) {
      return;
    }
    setErro(null);
    startReativar(async () => {
      const res = await ativarVersaoAntigaAction(produtoId, fichaId);
      if (res.error) setErro(res.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full items-center justify-between text-left"
        >
          <CardTitle className="text-base text-zinc-700">
            Histórico de versões ({naoVigentes.length})
          </CardTitle>
          <span className="text-xs text-zinc-500">{aberto ? "Esconder ▴" : "Ver ▾"}</span>
        </button>
      </CardHeader>
      {aberto && (
        <CardContent>
          {erro && (
            <p className="mb-2 text-sm text-red-600">⚠ {erro}</p>
          )}
          <ul className="divide-y divide-zinc-100">
            {naoVigentes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                    v{v.versao}
                  </span>
                  <span className="ml-2 text-xs text-zinc-600">
                    {fmtBR(v.data_vigencia_inicio)} → {fmtBR(v.data_vigencia_fim)}
                  </span>
                  {v.observacoes && (
                    <p className="mt-0.5 text-xs text-zinc-500">{v.observacoes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => reativar(v.id, v.versao)}
                  disabled={reativando}
                  className="text-xs text-zinc-700 hover:underline disabled:opacity-50"
                  title="Tornar esta versão vigente"
                >
                  Reativar v{v.versao}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
