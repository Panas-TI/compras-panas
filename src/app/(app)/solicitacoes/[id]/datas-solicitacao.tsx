"use client";

import { useState, useTransition } from "react";
import { formatDateBR } from "@/lib/utils";
import { atualizarDatasSolicitacaoAction } from "../actions";

// Cabeçalho com as datas da solicitação. Enquanto RASCUNHO (canEdit), as datas
// viram inputs editáveis; depois de lançada, vira texto fixo.
export function DatasSolicitacao({
  solicitacaoId,
  dataInicio,
  dataFim,
  canEdit,
}: {
  solicitacaoId: string;
  dataInicio: string;
  dataFim: string;
  canEdit: boolean;
}) {
  const [ini, setIni] = useState(dataInicio);
  const [fim, setFim] = useState(dataFim);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <h1 className="text-2xl font-semibold">
        Solicitação {formatDateBR(dataInicio)} a {formatDateBR(dataFim)}
      </h1>
    );
  }

  const salvar = (novoIni: string, novoFim: string) => {
    setErro(null);
    setOk(false);
    startTransition(async () => {
      const r = await atualizarDatasSolicitacaoAction(solicitacaoId, novoIni, novoFim);
      if (r.error) setErro(r.error);
      else {
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
        <span>Solicitação</span>
        <input
          type="date"
          value={ini}
          onChange={(e) => {
            setIni(e.target.value);
            if (e.target.value) salvar(e.target.value, fim);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-lg font-medium focus:border-zinc-500 focus:outline-none"
        />
        <span className="text-lg text-zinc-500">a</span>
        <input
          type="date"
          value={fim}
          onChange={(e) => {
            setFim(e.target.value);
            if (e.target.value) salvar(ini, e.target.value);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-lg font-medium focus:border-zinc-500 focus:outline-none"
        />
        {isPending && <span className="text-xs font-normal text-zinc-400">salvando…</span>}
        {ok && <span className="text-xs font-normal text-emerald-600">✓ salvo</span>}
      </h1>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
