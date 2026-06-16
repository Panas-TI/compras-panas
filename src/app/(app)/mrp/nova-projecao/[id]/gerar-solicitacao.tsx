"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gerarSolicitacaoAction } from "../actions";

export function GerarSolicitacaoBotao({ projecaoId }: { projecaoId: string }) {
  const router = useRouter();
  const [gerando, startGerar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const gerar = () => {
    if (
      !window.confirm(
        "Confirma gerar a solicitação? A projeção fica bloqueada pra edição (status = convertida)."
      )
    )
      return;
    setErro(null);
    startGerar(async () => {
      const res = await gerarSolicitacaoAction(projecaoId);
      if (res.error) {
        setErro(res.error);
        if (res.solicitacaoId) {
          router.push(`/solicitacoes/${res.solicitacaoId}`);
        }
        return;
      }
      if (res.solicitacaoId) {
        router.push(`/solicitacoes/${res.solicitacaoId}`);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={gerar} disabled={gerando}>
        {gerando ? "Gerando…" : "✓ Gerar solicitação semanal"}
      </Button>
      {erro && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          ⚠ {erro}
        </div>
      )}
    </div>
  );
}
