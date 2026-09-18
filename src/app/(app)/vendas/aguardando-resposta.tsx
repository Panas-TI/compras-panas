"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkCliente, Telefone } from "./ui";
import { atualizarContatoAction } from "./contato-actions";
import { RegistrarContato } from "./registrar-contato";
import { CANAIS } from "./contato-regras";

export type EmAberto = {
  id: string;
  clienteId: string;
  nome: string;
  canal: string | null;
  /** Resultado atual — sempre "sem_resposta" enquanto está na bandeja. */
  resultado: string;
  motivo: string | null;
  adiarAte: string | null;
  criadoEm: string;
  /** Já formatado no servidor, no fuso de Porto Alegre. */
  quando: string;
  observacao: string | null;
  telefone_e164: string | null;
  telefone_raw: string | null;
  telefone_presumido: boolean;
  canal_preferido: string | null;
};

/** Os três desfechos que uma resposta tardia costuma ter. O resto abre a ficha. */
const RAPIDOS = [
  { v: "vai_comprar", label: "Vai comprar", classe: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" },
  { v: "comprou", label: "Comprou", classe: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
  { v: "nao_agora", label: "Não agora", classe: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50" },
] as const;

/**
 * Bandeja "Aguardando resposta".
 *
 * Marcar "ainda sem resposta" agenda o retorno pra amanhã, o que tira o cliente
 * da lista de hoje. Quando ele respondia duas horas depois, não havia mais nem
 * onde clicar — a resposta morria no WhatsApp e o histórico seguia dizendo que
 * ninguém respondeu. Esta faixa é o lugar onde a resposta tardia cai.
 */
export function AguardandoResposta({
  itens,
  podeEscrever,
}: {
  itens: EmAberto[];
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  /** Qual botão está salvando — "<id do contato>:<resultado>". */
  const [mexendo, setMexendo] = useState<string | null>(null);

  if (itens.length === 0) return null;

  const mudarCanal = (i: EmAberto, canal: string) => {
    setErro(null);
    setMexendo(`${i.id}:canal`);
    startTransition(async () => {
      const r = await atualizarContatoAction({ id: i.id, resultado: i.resultado, canal });
      setMexendo(null);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  };

  const marcar = (id: string, resultado: string) => {
    setErro(null);
    setMexendo(`${id}:${resultado}`);
    startTransition(async () => {
      const r = await atualizarContatoAction({ id, resultado });
      setMexendo(null);
      if (r.error) setErro(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-950">Aguardando resposta</h2>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {itens.length} em aberto
        </span>
        <span className="text-xs text-amber-800/80">
          conforme as respostas chegam, classifique aqui — corrige o mesmo registro, não cria outro
        </span>
      </div>

      {erro && (
        <p className="border-b border-amber-200 bg-red-50 px-4 py-2 text-xs text-red-700">{erro}</p>
      )}

      <ul className="flex flex-col">
        {itens.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-100 px-4 py-3 last:border-0"
          >
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <LinkCliente id={i.clienteId} nome={i.nome} />
              <span className="text-xs text-zinc-500">
                {i.canal ?? "contato"} · {i.quando}
                {i.observacao && <> — “{i.observacao}”</>}
              </span>
            </div>

            <Telefone
              e164={i.telefone_e164}
              raw={i.telefone_raw}
              presumido={i.telefone_presumido}
              canal={i.canal_preferido}
            />

            {/* Canal fica aqui porque no momento do disparo não há o que
                classificar — e depois vira um toque só. Trocar o canal não
                marca o registro como corrigido: o gatilho só carimba quando o
                RESULTADO muda. */}
            {podeEscrever && (
              <select
                value={i.canal ?? ""}
                disabled={pendente && (mexendo?.startsWith(`${i.id}:`) ?? false)}
                onChange={(e) => mudarCanal(i, e.target.value)}
                className="h-7 rounded-md border border-amber-300 bg-white px-1.5 text-xs text-zinc-700 disabled:opacity-50"
                title="Por onde você falou com o cliente"
              >
                <option value="">canal…</option>
                {CANAIS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {podeEscrever && (
              <div className="flex flex-wrap items-center gap-1.5">
                {RAPIDOS.map((r) => {
                  // Só o botão clicado vira "salvando", e só a linha dele
                  // trava. Antes os três diziam "..." ao mesmo tempo e todas as
                  // linhas da bandeja congelavam: quem errasse o alvo não tinha
                  // como saber o que foi gravado, e a linha some depois.
                  const esteSalvando = mexendo === `${i.id}:${r.v}`;
                  const linhaOcupada = mexendo?.startsWith(`${i.id}:`) ?? false;
                  return (
                    <button
                      key={r.v}
                      type="button"
                      onClick={() => marcar(i.id, r.v)}
                      disabled={pendente && linhaOcupada}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${r.classe}`}
                    >
                      {esteSalvando ? "salvando..." : r.label}
                    </button>
                  );
                })}
                {/* Motivo e observação, quando houver. Abre o mesmo formulário
                    de sempre, já preenchido, e grava por cima deste contato. */}
                <RegistrarContato
                  clienteId={i.clienteId}
                  nome={i.nome}
                  rotulo="Detalhar…"
                  contato={{
                    id: i.id,
                    canal: i.canal,
                    resultado: i.resultado,
                    motivo: i.motivo,
                    observacao: i.observacao,
                    adiar_ate: i.adiarAte,
                    criado_em: i.criadoEm,
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
