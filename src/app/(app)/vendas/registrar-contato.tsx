"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const RESULTADOS = [
  { v: "vai_comprar", label: "Vai comprar", adiaDias: 2 },
  { v: "comprou", label: "Comprou agora", adiaDias: 0 },
  { v: "nao_agora", label: "Não agora", adiaDias: 14 },
  { v: "sem_resposta", label: "Sem resposta", adiaDias: 1 },
  { v: "recusou", label: "Não quer mais", adiaDias: 90 },
] as const;

const CANAIS = ["whatsapp", "telefone", "presencial", "email"] as const;

export function RegistrarContato({ clienteId, nome }: { clienteId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [canal, setCanal] = useState<string>("whatsapp");
  const [resultado, setResultado] = useState<string>("vai_comprar");
  const [observacao, setObservacao] = useState("");
  const [adiar, setAdiar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();

      // Sem data escolhida, usa o padrão do resultado — evita ligar de novo amanhã
      let adiarAte = adiar || null;
      if (!adiarAte) {
        const dias = RESULTADOS.find((r) => r.v === resultado)?.adiaDias ?? 0;
        if (dias > 0) {
          const d = new Date();
          d.setDate(d.getDate() + dias);
          adiarAte = d.toISOString().slice(0, 10);
        }
      }

      const { error } = await sb.from("vendas_contatos").insert({
        cliente_id: clienteId,
        usuario_id: user?.id ?? null,
        canal,
        resultado,
        adiar_ate: adiarAte,
        observacao: observacao.trim() || null,
      });
      if (error) throw new Error(error.message);

      setAberto(false);
      setObservacao("");
      setAdiar("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        Registrar contato
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-500">Contato com {nome}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm"
        >
          {CANAIS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm"
        >
          {RESULTADOS.map((r) => (
            <option key={r.v} value={r.v}>
              {r.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          voltar em
          <input
            type="date"
            value={adiar}
            onChange={(e) => setAdiar(e.target.value)}
            className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm"
          />
        </label>
      </div>

      <input
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="O que o cliente disse..."
        className="mt-2 h-8 w-full rounded border border-zinc-300 bg-white px-2 text-sm"
      />

      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}

      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
