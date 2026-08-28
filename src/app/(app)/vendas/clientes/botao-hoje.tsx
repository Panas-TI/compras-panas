"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { puxarParaHojeAction, tirarDeHojeAction } from "../fila-actions";

/**
 * Puxa o cliente para o atendimento de hoje.
 *
 * A lista do dia é montada por regra — ciclo, retorno combinado, reativação.
 * Isso cobre o previsível, não o pedido do dono nem o cliente que ligou
 * reclamando. Este botão é a porta pra decisão humana entrar na fila.
 */
export function BotaoHoje({
  clienteId,
  jaNaFila,
  podeEscrever,
}: {
  clienteId: string;
  jaNaFila: boolean;
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(false);

  if (!podeEscrever) return null;

  const acao = () =>
    iniciar(async () => {
      setErro(false);
      const r = jaNaFila
        ? await tirarDeHojeAction(clienteId)
        : await puxarParaHojeAction(clienteId);
      if (r.error) setErro(true);
      else router.refresh();
    });

  return (
    <button
      onClick={(e) => {
        // A linha inteira é um link pra ficha; sem isto o clique navegava.
        e.preventDefault();
        e.stopPropagation();
        acao();
      }}
      disabled={pendente}
      title={jaNaFila ? "Tirar do atendimento de hoje" : "Puxar para o atendimento de hoje"}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        erro
          ? "border-red-300 bg-red-50 text-red-700"
          : jaNaFila
            ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100"
            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {erro ? "erro" : pendente ? "…" : jaNaFila ? "✓ em hoje" : "+ hoje"}
    </button>
  );
}
