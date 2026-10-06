import { guardVendas } from "./guard";
import {
  EstadoPill,
  Telefone,
  ItensHabituais,
  LinkCliente,
  ResultadoPill,
  MotivoTag,
  diasTexto,
  recenciaDias,
} from "./ui";
import { RegistrarRapido } from "./registrar-rapido";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { CoberturaClientes } from "./cobertura-clientes";
import { AlertaImportacao } from "./alerta-importacao";
import { PlacarMeta } from "./placar-meta";
import { montarPlanoDoDia, TAMANHO_LISTA, type ClienteDoPlano } from "./plano-do-dia";
import { createClient } from "@/lib/supabase/server";
import { SeletorRota } from "./seletor-rota";
import { RotasHoje } from "./rotas-hoje";
import {
  recadoDoDia,
  rotinaDoCliente,
  hojeEhODia,
  rotuloAgenda,
  type Rota,
} from "./rota-regras";
import { diaEmSP } from "./contato-regras";

export const dynamic = "force-dynamic";

const FAIXA: Record<ClienteDoPlano["faixa"], { rotulo: string; classe: string }> = {
  escolhido: { rotulo: "puxado à mão", classe: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300" },
  retorno: { rotulo: "retorno combinado", classe: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  agenda: { rotulo: "dia marcado", classe: "bg-sky-100 text-sky-900 border-sky-300" },
  acompanhamento: {
    rotulo: "falado, sem pedido",
    classe: "bg-orange-50 text-orange-900 border-orange-200",
  },
  vencido: { rotulo: "vencido", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  previsto: { rotulo: "vence agora", classe: "bg-blue-50 text-blue-800 border-blue-200" },
  novo: { rotulo: "cliente novo", classe: "bg-violet-50 text-violet-800 border-violet-200" },
  reativacao: { rotulo: "reativação", classe: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export default async function VendasHojePage() {
  const { podeEscrever } = await guardVendas();
  // O MESMO "hoje" que montarPlanoDoDia() usa. Com este em UTC e aquele no
  // fuso local, das 21h à meia-noite a tela tinha dois dias diferentes: um
  // contato com retorno pra hoje ficava silenciado no plano E fora da bandeja
  // — invisível nas duas seções, à noite, que é quando se trabalha.
  const hoje = diaEmSP(new Date());
  const { lista, totalReativacao } = await montarPlanoDoDia();

  // Quem saiu da lista por ter combinado data — some sem explicação seria pior.
  const supabase = await createClient();
  //
  // Pela view: uma linha por cliente, já a mais recente. A consulta anterior
  // varria vendas_contatos inteira sem limite e, acima de mil linhas, o
  // PostgREST cortaria em silêncio.
  //
  // `> hoje` e não `>= hoje`: quem está marcado pra voltar hoje não está fora
  // da lista — está dentro dela, como retorno combinado.
  const { data: adiados } = await supabase
    .from("vendas_ultimo_contato")
    .select("cliente_id, adiar_ate, resultado, motivo, observacao")
    .gt("adiar_ate", hoje);

  const aguardando = (adiados ?? []).filter((a) => a.cliente_id);
  const nomePorCliente = new Map<string, string>();
  if (aguardando.length > 0) {
    const { data: nomes } = await supabase
      .from("vendas_clientes")
      .select("id, nome")
      .in("id", aguardando.map((a) => a.cliente_id!));
    for (const n of nomes ?? []) nomePorCliente.set(n.id, n.nome);
  }

  // A bandeja "Aguardando resposta" foi removida.
  //
  // Era onde o trabalho ia morrer: o contato ficava lá esperando alguém voltar
  // pra classificar, e em 30 dias isso não aconteceu 252 vezes de 443. Pior,
  // enquanto não classificava, o sistema inventava uma data de retorno e
  // chamava o próprio palpite de "retorno combinado".
  //
  // Agora um clique é o ato inteiro: nada fica pendente, e o cliente volta
  // sozinho pela escada de acompanhamento — 2, 4, 8 dias — com a contagem de
  // tentativas à vista. Quem passa da quarta sai da lista do dia e aparece em
  // "Não está fechando", que é outro tipo de decisão.
  // O bloco "fora da lista" usa o mesmo corte `adiar_ate >= hoje`, então todo
  // cliente da bandeja apareceria lá embaixo também — contado duas vezes na
  // mesma tela. A bandeja é a versão acionável; o rodapé fica com o resto.
  const naLista = new Set(lista.map((c) => c.id));
  const foraDaLista = aguardando.filter((a) => !naLista.has(a.cliente_id!));

  // A lista do dia são duas coisas diferentes, e misturá-las apagou o sinal.
  //
  // "Para hoje" é o ciclo de compra: quem prometeu voltar, quem passou do
  // ponto, quem vence agora, cliente novo. É onde está a venda. "Reativação" é
  // backlog — cliente parado há meses que a cota preenche pra ninguém ser
  // esquecido, útil mas sem hora marcada.
  //
  // Numa fila única de 50 cartões com o mesmo peso, num dia em que o ciclo
  // rende 14, os 36 de reativação viravam a tela inteira e a barra de progresso
  // cobrava as duas coisas igual. A leitura de quem abre é "o sistema parou de
  // me indicar quem vai comprar" — quando na verdade ele indicou, e o sinal
  // ficou soterrado. Separado, a primeira coisa que se lê é o número do dia.
  const doDia = lista.filter((c) => c.faixa !== "reativacao");
  const reativacao = lista.filter((c) => c.faixa === "reativacao");
  const trabalhadosDoDia = doDia.filter((c) => c.trabalhado).length;
  const pct = doDia.length > 0 ? Math.round((trabalhadosDoDia / doDia.length) * 100) : 0;
  const pendentes = doDia.length - trabalhadosDoDia;

  const cartao = (c: ClienteDoPlano) => {
          const rec = recenciaDias(c.ultima_compra);
          const f = FAIXA[c.faixa];
          return (
            // Apagar o cartão significa "já resolvido hoje". Retorno combinado
            // para hoje não está resolvido: você falou de manhã, ficou de
            // voltar à tarde, e é agora. Apagado e com "✓ falado hoje" o
            // cartão dizia o contrário do que precisa ser feito.
            <Card
              key={c.id}
              className={c.trabalhado && c.faixa !== "retorno" ? "opacity-60" : undefined}
            >
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${f.classe}`}
                    >
                      {f.rotulo}
                    </span>
                    <EstadoPill status={c.status} />
                    <LinkCliente id={c.id} nome={c.nome} />
                    <SeletorRota
                      clienteId={c.id}
                      rota={(c.rota ?? "poa") as Rota}
                      podeEscrever={podeEscrever}
                    />
                    {c.trabalhado && (
                      <span
                        className={`text-xs font-medium ${
                          c.faixa === "retorno" ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {c.faixa === "retorno" ? "↻ falado hoje · volta agora" : "✓ falado hoje"}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600">
                    ticket{" "}
                    <strong className="tabular-nums text-zinc-900">
                      {formatCurrencyBRL(Number(c.ticket_medio ?? 0))}
                    </strong>
                  </div>
                </div>

                <p className="text-sm text-zinc-600">
                  {c.faixa === "escolhido"
                    ? (c.motivoManual ?? "alguém puxou este cliente para hoje")
                    : c.faixa === "retorno" && c.combinado
                    ? `ele pediu para você voltar em ${formatDateBR(c.combinado.adiarAte)}${
                        c.combinado.observacao ? ` — “${c.combinado.observacao}”` : ""
                      }`
                    : c.faixa === "acompanhamento" && c.combinado
                    ? `${c.combinado.tentativas}ª vez que você fala com ele desde a última compra · sem pedido até agora`
                    : c.faixa === "agenda"
                    ? `você marcou ${rotuloAgenda(c.dias_contato)} para este cliente${
                        c.motivo_contato ? ` · ${c.motivo_contato}` : ""
                      }`
                    : (c.motivo_contato ?? (c.faixa === "reativacao" ? "parado além do ritmo dele" : ""))}
                  {c.intervalo_mediano_dias ? ` · compra a cada ${c.intervalo_mediano_dias} dias` : ""}
                  {c.ultima_compra
                    ? ` · última ${formatDateBR(c.ultima_compra)} (${diasTexto(rec)})`
                    : ""}
                </p>

                {/* O que prometer no telefone.
                    Antes, saber que a Serra só recebe quinta e que o pedido
                    fecha 1 a 2 dias antes era memória de quem estava há tempo
                    na casa. Quem sentasse aqui pela primeira vez prometia
                    entrega que não existia. Agora a frase vem pronta. */}
                {(() => {
                  const rec = recadoDoDia(c.rota ?? "poa", hoje);
                  const rotina = rotinaDoCliente(c.dia_pedido_habitual);
                  const naJanela = hojeEhODia(c.dia_pedido_habitual, hoje);
                  return (
                    <p
                      className={`rounded border px-2 py-1 text-sm ${
                        rec.bom
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                      }`}
                    >
                      {rec.bom ? "📦 " : "⚠ "}
                      {rec.texto}
                      {rotina && (
                        <span className={rec.bom ? "text-emerald-700/80" : "text-amber-800/80"}>
                          {" · "}
                          {rotina}
                          {naJanela && <strong> — hoje é o dia</strong>}
                        </span>
                      )}
                    </p>
                  );
                })()}

                {/* A munição: o que ele comprava e parou. É o argumento que
                    transforma "faz tempo que não compra" em algo respondível. */}
                {c.oportunidade && (
                  <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-900">
                    💡 Não pede <strong>{c.oportunidade.produto}</strong> há{" "}
                    {c.oportunidade.dias} dias — já comprou {c.oportunidade.vezes} vezes
                  </p>
                )}

                {c.itens_habituais && (
                  <p className="text-sm">
                    <span className="text-zinc-400">Costuma levar: </span>
                    <ItensHabituais itens={c.itens_habituais} />
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                  <Telefone
                    e164={c.telefone_e164}
                    raw={c.telefone_raw}
                    presumido={c.telefone_presumido}
                    canal={c.canal_preferido}
                  />
                  {/* Um clique: grava "ainda sem resposta" e manda o cliente
                      pra bandeja. Classificar canal, resultado e motivo agora,
                      antes de o cliente responder, era pedir informação que
                      ainda não existe. */}
                  {podeEscrever && <RegistrarRapido clienteId={c.id} />}
                </div>
              </CardContent>
            </Card>
          );
  };

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <CoberturaClientes />
      <PlacarMeta />
      <RotasHoje hoje={hoje} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plano do dia · {formatDateBR(hoje)}</h1>
          <p className="text-sm text-zinc-600">
            {doDia.length === 0
              ? "Ninguém no ciclo de compra hoje — só reativação abaixo."
              : `${doDia.length} ${
                  doDia.length === 1 ? "cliente no ciclo de compra" : "clientes no ciclo de compra"
                }: retorno combinado primeiro, depois vencidos e quem vence agora.`}
            {reativacao.length > 0 && ` Mais ${reativacao.length} de reativação no fim da página.`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {trabalhadosDoDia}
            <span className="text-base font-normal text-zinc-400"> de {doDia.length}</span>
          </p>
          <p className="text-xs text-zinc-500">
            {pendentes > 0 ? `faltam ${pendentes}` : "lista concluída"}
          </p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? "bg-emerald-500" : "bg-zinc-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>


      {doDia.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Nenhum cliente no ciclo de compra hoje. Quem está esperando resposta aparece na bandeja
            acima; quem combinou data volta no dia marcado.
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        {doDia.map(cartao)}
      </section>

      {reativacao.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 border-t border-zinc-200 pt-4">
            <h2 className="text-sm font-semibold text-zinc-700">
              Reativação · {reativacao.length}
            </h2>
            <p className="text-xs text-zinc-500">
              parados há meses, sem hora marcada — só se sobrar tempo depois do bloco de cima
            </p>
          </div>
          {reativacao.map(cartao)}
        </section>
      )}

      <p className="text-xs text-zinc-500">
        A tela tem alvo de {TAMANHO_LISTA} cartões por dia; o que sobra do ciclo de compra vira
        cota de reativação. {totalReativacao} inativos aguardam — na cota atual, o backlog é
        percorrido por inteiro em algumas semanas.
      </p>

      {foraDaLista.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-600">
            <strong className="text-zinc-900">{foraDaLista.length}</strong>{" "}
            {foraDaLista.length === 1 ? "cliente fora da lista" : "clientes fora da lista"} por
            combinação anterior
            <span className="ml-1 text-xs text-zinc-400">(clique pra ver)</span>
          </summary>
          <ul className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3">
            {foraDaLista.map((a) => (
              <li key={a.cliente_id} className="flex flex-wrap items-center gap-2 text-sm">
                <ResultadoPill resultado={a.resultado} />
                <LinkCliente id={a.cliente_id!} nome={nomePorCliente.get(a.cliente_id!) ?? "cliente"} />
                <span className="text-zinc-500">volta em {formatDateBR(String(a.adiar_ate))}</span>
                <MotivoTag motivo={a.motivo} />
                {a.observacao && <span className="text-zinc-500">— “{a.observacao}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
