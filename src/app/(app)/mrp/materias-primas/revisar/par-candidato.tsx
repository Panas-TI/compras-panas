"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { consolidarAction, marcarRevisadoAction } from "./actions";

type Item = {
  id: string;
  codigo_queops: string | null;
  nome: string;
};

type Candidato = {
  item: Item;
  sim: number;
};

export function ParCandidato({
  novo,
  candidatos,
}: {
  novo: Item;
  candidatos: Candidato[];
}) {
  const [selecionado, setSelecionado] = useState<string>(candidatos[0]?.item.id ?? "");
  const [manterNomeNovo, setManterNomeNovo] = useState(false);
  const [working, startWork] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const consolidar = () => {
    if (!selecionado) {
      setErro("Selecione qual item antigo é o duplicado.");
      return;
    }
    setErro(null);
    startWork(async () => {
      const res = await consolidarAction(novo.id, selecionado, manterNomeNovo);
      if (res.error) setErro(res.error);
      else setFeito("✓ Consolidado");
    });
  };

  const marcarNaoDuplicata = () => {
    setErro(null);
    startWork(async () => {
      const res = await marcarRevisadoAction(novo.id);
      if (res.error) setErro(res.error);
      else setFeito("✓ Marcado como não-duplicata");
    });
  };

  if (feito) {
    return (
      <Card className="border-emerald-300 bg-emerald-50">
        <CardContent className="py-3 text-sm text-emerald-900">{feito}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Item que eu criei (na importação)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs text-blue-900">
              {novo.codigo_queops}
            </span>
            <span className="font-medium">{novo.nome}</span>
          </div>
        </div>

        <div className="text-sm text-zinc-700">
          ⬇️ Provavelmente é o <strong>mesmo item</strong> que já existia como:
        </div>

        <div className="flex flex-col gap-1.5">
          {candidatos.map((c) => (
            <label
              key={c.item.id}
              className={`flex cursor-pointer items-baseline gap-2 rounded-md border p-2 hover:bg-zinc-50 ${
                selecionado === c.item.id ? "border-blue-400 bg-blue-50" : "border-zinc-200"
              }`}
            >
              <input
                type="radio"
                name={`escolha-${novo.id}`}
                value={c.item.id}
                checked={selecionado === c.item.id}
                onChange={() => setSelecionado(c.item.id)}
                className="mt-1"
              />
              <span className="flex-1">
                <span className="font-mono text-xs text-zinc-500">
                  {c.item.codigo_queops ?? "(sem código)"}
                </span>{" "}
                <span className="font-medium">{c.item.nome}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  similaridade {(c.sim * 100).toFixed(0)}%
                </span>
              </span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={manterNomeNovo}
            onChange={(e) => setManterNomeNovo(e.target.checked)}
          />
          Ao consolidar, usar o nome NOVO (&ldquo;{novo.nome}&rdquo;) em vez do antigo
        </label>

        {erro && <p className="text-sm text-red-600">⚠ {erro}</p>}

        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
          <Button onClick={consolidar} disabled={working || !selecionado}>
            {working ? "Aplicando…" : "✓ Consolidar (manter antigo, ganhar código novo)"}
          </Button>
          <Button variant="outline" onClick={marcarNaoDuplicata} disabled={working}>
            Não é duplicata (esconder)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
