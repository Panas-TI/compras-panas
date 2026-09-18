"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MOTIVOS_CONTATO, MOTIVO_OUTRO } from "./ui";
import { atualizarContatoAction } from "./contato-actions";
import {
  RESULTADOS,
  CANAIS,
  calcularAdiarAte,
  diasAteVoltar,
  hojeMais,
  ddmm,
} from "./contato-regras";

/** Contato já gravado que este formulário vai corrigir em vez de criar um novo. */
export type ContatoEditavel = {
  id: string;
  canal: string | null;
  resultado: string | null;
  motivo: string | null;
  observacao: string | null;
  adiar_ate: string | null;
  criado_em: string;
};

export function RegistrarContato({
  clienteId,
  nome,
  intervaloDias = null,
  contato = null,
  rotulo,
}: {
  clienteId: string;
  nome: string;
  /** Ciclo típico de recompra do cliente (vendas_clientes.intervalo_mediano_dias). */
  intervaloDias?: number | null;
  /**
   * Quando vem preenchido, o formulário CORRIGE este contato em vez de criar
   * outro — é o caminho da resposta que chegou depois. Sem ele, comportamento
   * de sempre: registra contato novo.
   */
  contato?: ContatoEditavel | null;
  rotulo?: string;
}) {
  const router = useRouter();
  const editando = !!contato;

  const [aberto, setAberto] = useState(false);
  // Em edição com canal vazio o campo fica vazio de propósito: herdar
  // "whatsapp" faria a tela afirmar um canal que ninguém digitou.
  const [canal, setCanal] = useState<string>(contato ? (contato.canal ?? "") : "whatsapp");
  const [resultado, setResultado] = useState<string>(contato?.resultado ?? "vai_comprar");
  const [motivo, setMotivo] = useState<string>(contato?.motivo ?? "");
  const [observacao, setObservacao] = useState(contato?.observacao ?? "");
  const [adiar, setAdiar] = useState(contato?.adiar_ate ?? "");
  /**
   * O vendedor mexeu no campo de data?
   *
   * No modo edição o campo vem semeado com a data do resultado ANTERIOR, e
   * qualquer data preenchida vence o prazo padrão do novo resultado. Sem esta
   * distinção, trocar "ainda sem resposta" (retorno amanhã) para "Não quer
   * mais" (90 dias) gravava amanhã: o cliente que pediu pra não ser mais
   * procurado voltava à fila no dia seguinte.
   */
  const [dataTocada, setDataTocada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const comprou = resultado === "comprou";
  const retornoPrevisto = hojeMais(diasAteVoltar(intervaloDias));
  /**
   * A data que vai ser gravada.
   *
   * Três casos, nesta ordem:
   *  - mexeram no campo → vale o que digitaram;
   *  - o resultado continua o mesmo da gravação anterior → mantém a data que
   *    já estava lá. Quem combinou "volta dia 20" não perde isso só por abrir
   *    o formulário e salvar;
   *  - o resultado mudou → segue o prazo padrão do novo resultado.
   */
  const resultadoMudou = !editando || resultado !== contato.resultado;
  const adiarEfetivo = dataTocada
    ? adiar
    : resultadoMudou
      ? (calcularAdiarAte(resultado, intervaloDias, null) ?? "")
      : (contato?.adiar_ate ?? "");

  const precisaDetalhar = motivo === MOTIVO_OUTRO && !observacao.trim();

  const salvar = async () => {
    // "Outro" sem detalhe não serve pra nada depois — é o caso que a lista
    // fechada existe justamente pra evitar.
    if (precisaDetalhar) {
      setErro("Escolheu “Outro” — escreva o que o cliente disse.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        // As travas (janela e "só o mais recente") são checadas no servidor.
        const r = await atualizarContatoAction({
          id: contato.id,
          resultado,
          motivo,
          observacao,
          canal,
          // Manda a data só quando ela é uma escolha (digitada, ou a que já
          // estava valendo). Se o resultado mudou e ninguém tocou no campo,
          // manda null e deixa o servidor aplicar o padrão do novo resultado.
          adiarAte: dataTocada || !resultadoMudou ? adiarEfetivo || null : null,
        });
        if (r.error) throw new Error(r.error);
      } else {
        const sb = createClient();
        const {
          data: { user },
        } = await sb.auth.getUser();

        const { error } = await sb.from("vendas_contatos").insert({
          cliente_id: clienteId,
          usuario_id: user?.id ?? null,
          canal,
          resultado,
          motivo: motivo || null,
          adiar_ate: calcularAdiarAte(resultado, intervaloDias, dataTocada ? adiar || null : null),
          observacao: observacao.trim() || null,
        });
        if (error) throw new Error(error.message);
      }

      setAberto(false);
      if (!editando) {
        setMotivo("");
        setObservacao("");
        setAdiar("");
        setDataTocada(false);
      }
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
        {rotulo ?? (editando ? "Corrigir resposta" : "Registrar contato")}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-500">
        {editando ? (
          // "Contato de", não "Corrigindo": o mesmo formulário serve para
          // concluir um contato que está aguardando resposta e para corrigir um
          // desfecho errado. Chamar os dois de correção confunde quem está só
          // completando o que faltava.
          <>
            Contato de {ddmm(String(contato.criado_em).slice(0, 10))} com {nome}
          </>
        ) : (
          <>Contato com {nome}</>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm"
        >
          {editando && !contato.canal && <option value="">canal não informado</option>}
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

        {/* Comprou agora → quem calcula o retorno é o sistema. O vendedor não
            tem como saber quando o cliente vai precisar de novo; o ciclo sabe. */}
        {comprou ? (
          <span className="text-xs text-zinc-600">
            volta em <strong>{ddmm(retornoPrevisto)}</strong>{" "}
            <span className="text-zinc-400">
              {intervaloDias
                ? `(${diasAteVoltar(intervaloDias)} dias — 3 antes do ciclo de ${intervaloDias})`
                : "(sem ciclo definido ainda)"}
            </span>
          </span>
        ) : (
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            voltar em
            <input
              type="date"
              value={adiarEfetivo}
              min={hojeMais(0)}
              // Um ano é o teto que o banco aceita. Sem `max`, escorregar no
              // ano ("9999") silencia o cliente pra sempre: a fila esconde
              // quem tem data de retorno no futuro.
              max={hojeMais(365)}
              onChange={(e) => {
                setDataTocada(true);
                setAdiar(e.target.value);
              }}
              className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm"
            />
          </label>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="h-8 min-w-[240px] flex-1 rounded border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="">O que o cliente disse…</option>
          {MOTIVOS_CONTATO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <input
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder={
          motivo === MOTIVO_OUTRO
            ? "Escreva o que o cliente disse (obrigatório)"
            : "Detalhe, se houver (opcional)"
        }
        className={`mt-2 h-8 w-full rounded border bg-white px-2 text-sm ${
          precisaDetalhar ? "border-amber-400" : "border-zinc-300"
        }`}
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
