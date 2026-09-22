import { LinkCliente, Telefone } from "./ui";
import { RegistrarContato } from "./registrar-contato";

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

/**
 * Bandeja "Aguardando resposta".
 *
 * Registrar contato é um clique e não pergunta nada: no momento do disparo não
 * há o que classificar, porque a maioria não responde na hora. O cliente cai
 * aqui e fica visível até alguém fechar o assunto.
 *
 * Um botão só, "Concluir", que abre o formulário completo. Havia antes três
 * botões de desfecho rápido (vai comprar, comprou, não agora) e um seletor de
 * canal na própria linha: davam meia classificação — desfecho sem motivo, canal
 * sem desfecho — e ainda assim era preciso abrir o formulário para completar.
 * Um caminho só evita registro pela metade.
 */
export function AguardandoResposta({
  itens,
  podeEscrever,
}: {
  itens: EmAberto[];
  podeEscrever: boolean;
}) {
  if (itens.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-950">Aguardando resposta</h2>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {itens.length} em aberto
        </span>
        <span className="text-xs text-amber-800/80">
          respondeu? clique em Concluir e registre canal, desfecho e o que ele disse — corrige o
          mesmo contato, não cria outro. Marcando data de retorno, o cliente sai daqui e volta como
          retorno combinado naquele dia
        </span>
      </div>

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

            {podeEscrever && (
              <RegistrarContato
                clienteId={i.clienteId}
                nome={i.nome}
                rotulo="Concluir"
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
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
