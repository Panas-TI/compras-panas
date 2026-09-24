"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DIAS_CURTO } from "./rota-regras";
import { definirDiasContatoAction } from "./agenda-actions";

const SEMANA = [1, 2, 3, 4, 5, 6, 7];

/**
 * Os dias em que este cliente deve ser chamado.
 *
 * Sete botõezinhos e não um multi-select: a pergunta é "quais dias?", e a
 * resposta certa tem que caber num olhar e num clique por dia. Um select
 * múltiplo esconde o que está marcado atrás de um clique — justamente o que
 * se quer ver de relance no cadastro.
 *
 * Grava a cada clique, sem botão de salvar. O estado local é otimista pra
 * tecla não engasgar; se o servidor recusar, volta ao que era e mostra o erro.
 */
export function SeletorAgenda({
  clienteId,
  dias,
  podeEscrever,
}: {
  clienteId: string;
  dias: number[] | null;
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [locais, setLocais] = useState<number[]>(dias ?? []);

  const alternar = (d: number) => {
    const antes = locais;
    const depois = locais.includes(d) ? locais.filter((x) => x !== d) : [...locais, d];
    setLocais(depois);
    setErro(null);
    startTransition(async () => {
      const res = await definirDiasContatoAction(clienteId, depois);
      if (res.error) {
        setLocais(antes);
        setErro(res.error);
      } else {
        router.refresh();
      }
    });
  };

  if (!podeEscrever) {
    return locais.length > 0 ? (
      <span className="text-sm text-zinc-600">
        falar {[...locais].sort((a, b) => a - b).map((d) => DIAS_CURTO[d]).join(" · ")}
      </span>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {SEMANA.map((d) => {
          const on = locais.includes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={pendente}
              onClick={() => alternar(d)}
              aria-pressed={on}
              className={`h-7 w-10 rounded-full border text-[11px] font-medium capitalize transition-colors disabled:opacity-50 ${
                on
                  ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                  : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {DIAS_CURTO[d]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        {locais.length === 0
          ? "Sem dia marcado — ele aparece quando o ciclo de compra dele vence."
          : "Ele aparece na lista só nesses dias. Retorno combinado passa por cima."}
      </p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
