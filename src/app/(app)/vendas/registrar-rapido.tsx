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
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erro && <span className="text-xs text-red-600">{erro}</span>}
      {aviso && <span className="text-xs text-amber-700">{aviso}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() => {
          setErro(null);
          setAviso(null);
          startTransition(async () => {
            const r = await registrarContatoRapidoAction(clienteId);
            if (r.error) setErro(r.error);
            // Nada acontecer sem explicação é pior que um erro: quem clica fica
            // clicando de novo achando que a tela travou.
            else if (r.jaAberto) setAviso("já está aguardando resposta");
            else router.refresh();
          });
        }}
      >
        {pendente ? "Registrando..." : "Registrar contato"}
      </Button>
    </span>
  );
}
