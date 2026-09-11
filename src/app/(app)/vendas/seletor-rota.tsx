"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROTAS, type Rota } from "./rota-regras";
import { definirRotaAction } from "./rota-actions";

/**
 * A rota do cliente, em forma de etiqueta que também é o controle de troca.
 *
 * Etiqueta e edição no mesmo lugar de propósito: quem vê "rota a definir" no
 * cartão consegue resolver ali, sem procurar tela de cadastro. Sem isso os 8
 * clientes de fora ficariam indefinidos pra sempre.
 */
export function SeletorRota({
  clienteId,
  rota,
  podeEscrever,
}: {
  clienteId: string;
  rota: Rota;
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const r = ROTAS[rota] ?? ROTAS.poa;

  const etiqueta = (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${r.classe}`}
      title={r.desc}
    >
      {rota === "a_definir" ? "⚠ " : ""}
      {r.curto}
    </span>
  );

  // Porto Alegre é o padrão e é verdade pra 98% da carteira: virar etiqueta em
  // todo cartão seria ruído. Só aparece quando diz algo.
  if (!podeEscrever) return rota === "poa" ? null : etiqueta;

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={rota}
        disabled={pendente}
        onChange={(e) => {
          const nova = e.target.value as Rota;
          setErro(null);
          startTransition(async () => {
            const res = await definirRotaAction(clienteId, nova);
            if (res.error) setErro(res.error);
            else router.refresh();
          });
        }}
        title={r.desc}
        className={`h-6 cursor-pointer rounded-full border px-1.5 text-[11px] font-medium ${r.classe} disabled:opacity-50`}
      >
        {(Object.keys(ROTAS) as Rota[]).map((k) => (
          <option key={k} value={k}>
            {k === "a_definir" ? "⚠ definir rota" : ROTAS[k].rotulo}
          </option>
        ))}
      </select>
      {erro && <span className="text-[11px] text-red-600">{erro}</span>}
    </span>
  );
}
