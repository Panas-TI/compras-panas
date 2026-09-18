"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { registrarContatoRapidoAction } from "./contato-actions";

/**
 * Um clique, sem formulário.
 *
 * O cartão some da lista e o cliente aparece na bandeja "Aguardando resposta",
 * que é onde ele vai ser classificado quando responder. Antes, este botão abria
 * um formulário de canal, resultado, motivo e data — e preencher isso vinte
 * vezes seguidas, sem ter o que responder ainda, era o que travava o ritmo.
 */
export function RegistrarRapido({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erro && <span className="text-xs text-red-600">{erro}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await registrarContatoRapidoAction(clienteId);
            if (r.error) setErro(r.error);
            else router.refresh();
          });
        }}
      >
        {pendente ? "Registrando..." : "Registrar contato"}
      </Button>
    </span>
  );
}
