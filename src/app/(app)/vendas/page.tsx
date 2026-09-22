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
import { AlertaImportacao } from "./alerta-importacao";
import { PlacarMeta } from "./placar-meta";
import { montarPlanoDoDia, TAMANHO_LISTA, type ClienteDoPlano } from "./plano-do-dia";
import { createClient } from "@/lib/supabase/server";
import { AguardandoResposta, type EmAberto } from "./aguardando-resposta";
import { SeletorRota } from "./seletor-rota";
import { RotasHoje } from "./rotas-hoje";
import { recadoDoDia, rotinaDoCliente, hojeEhODia, type Rota } from "./rota-regras";
import { hojeMais, rotuloQuando, diaEmSP, inicioDoDiaSP, TETO_BANDEJA_DIAS } from "./contato-regras";

export const dynamic = "force-dynamic";

const FAIXA: Record<ClienteDoPlano["faixa"], { rotulo: string; classe: string }> = {
  escolhido: { rotulo: "puxado à mão", classe: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300" },
  retorno: { rotulo: "retorno combinado", classe: "bg-emerald-100 text-emerald-900 border-emerald-300" },
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
  const { lista, trabalhados, totalReativacao } = await montarPlanoDoDia();

  // Quem saiu da lista por ter combinado data — some sem explicação seria pior.
  const supabase = await createClient();
  const { data: adiados } = await supabase
    .from("vendas_contatos")
    .select("cliente_id, adiar_ate, resultado, motivo, observacao, cliente:vendas_clientes(id, nome)")
    .gte("adiar_ate", hoje)
    .order("criado_em", { ascending: false });

  const vistos = new Set<string>();
  const aguardando = (adiados ?? []).filter((a) => {
    if (!a.cliente_id || vistos.has(a.cliente_id)) return false;
    vistos.add(a.cliente_id);
    return true;
  });

  // Bandeja "Aguardando resposta".
  //
  // Mostra exatamente quem está silenciado na fila por um contato sem desfecho:
  // marcar "ainda sem resposta" agenda o retorno pra amanhã e o cliente some da
  // lista de hoje. Enquanto essa data não vence, só a bandeja o exibe; quando
  // vence, ele volta como "retorno combinado" logo acima e sai daqui — por isso
  // o corte é pela data de retorno e não por idade fixa, que duplicaria o
  // cliente nas duas seções. `> hoje` e não `>= hoje`: o combinado marcado pra
  // hoje já é retorno, e apareceria nos dois lugares.
  //
  // Duas consultas, ambas limitadas de propósito. Uma varredura de todos os
  // contatos da janela estouraria o teto de 1000 linhas do PostgREST, que
  // trunca EM SILÊNCIO: o cliente cortado sumiria da bandeja e da lista ao
  // mesmo tempo — de volta ao problema que esta tela resolve.
  const { data: candidatos } = await supabase
    .from("vendas_contatos")
    .select(
      `id, cliente_id, canal, resultado, motivo, observacao, adiar_ate, criado_em,
       cliente:vendas_clientes(id, nome, ativo, telefone_e164, telefone_raw,
                               telefone_presumido, canal_preferido)`
    )
    .eq("resultado", "sem_resposta")
    // Concluído sai da bandeja. Marcar "ainda sem resposta" com data de retorno
    // é uma decisão tomada — fica combinado voltar tal dia —, e o cliente volta
    // como "retorno combinado" naquela data, não fica pendurado aqui.
    .is("concluido_em", null)
    .gte("criado_em", inicioDoDiaSP(hojeMais(-TETO_BANDEJA_DIAS)))
    .order("criado_em", { ascending: false })
    .limit(200);

  // Dos candidatos, ficam só os que ninguém sucedeu com um contato mais novo.
  const emAberto: EmAberto[] = [];
  if (candidatos && candidatos.length > 0) {
    const ids = candidatos.map((c) => c.cliente_id);
    const { data: posteriores } = await supabase
      .from("vendas_contatos")
      .select("cliente_id, criado_em")
      .in("cliente_id", ids)
      .order("criado_em", { ascending: false })
      .limit(1000);

    const maisNovo = new Map<string, string>();
    for (const p of posteriores ?? []) {
      if (p.cliente_id && !maisNovo.has(p.cliente_id)) {
        maisNovo.set(p.cliente_id, String(p.criado_em));
      }
    }

    const jaVisto = new Set<string>();
    for (const c of candidatos) {
      if (!c.cliente_id || jaVisto.has(c.cliente_id) || !c.cliente?.ativo) continue;
      // Fica na bandeja enquanto o retorno não vence OU enquanto for de hoje.
      // O filtro era só `adiar_ate > hoje`: um contato feito hoje com retorno
      // marcado para hoje não caía aqui nem na fila — sumia das duas.
      const deHoje = diaEmSP(String(c.criado_em)) === hoje;
      if (!deHoje && String(c.adiar_ate ?? "") <= hoje) continue;
      jaVisto.add(c.cliente_id);
      if (maisNovo.get(c.cliente_id) !== String(c.criado_em)) continue;
      emAberto.push({
        id: c.id,
        clienteId: c.cliente.id,
        nome: c.cliente.nome,
        canal: c.canal,
        resultado: c.resultado ?? "sem_resposta",
        motivo: c.motivo,
        adiarAte: c.adiar_ate,
        criadoEm: String(c.criado_em),
        quando: rotuloQuando(String(c.criado_em)),
        observacao: c.observacao,
        telefone_e164: c.cliente.telefone_e164,
        telefone_raw: c.cliente.telefone_raw,
        telefone_presumido: c.cliente.telefone_presumido,
        canal_preferido: c.cliente.canal_preferido,
      });
    }
  }

  // O bloco "fora da lista" usa o mesmo corte `adiar_ate >= hoje`, então todo
  // cliente da bandeja apareceria lá embaixo também — contado duas vezes na
  // mesma tela. A bandeja é a versão acionável; o rodapé fica com o resto.
  const naBandeja = new Set(emAberto.map((i) => i.clienteId));
  const naLista = new Set(lista.map((c) => c.id));
  const foraDaLista = aguardando.filter(
    (a) => !naBandeja.has(a.cliente_id!) && !naLista.has(a.cliente_id!)
  );

  const pct = lista.length > 0 ? Math.round((trabalhados / lista.length) * 100) : 0;
  const pendentes = lista.length - trabalhados;

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <PlacarMeta />
      <RotasHoje hoje={hoje} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plano do dia · {formatDateBR(hoje)}</h1>
          <p className="text-sm text-zinc-600">
            Lista fechada de {lista.length} clientes. Vencidos primeiro, depois quem vence agora, e
            a cota de reativação completa.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {trabalhados}
            <span className="text-base font-normal text-zinc-400"> de {lista.length}</span>
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

      <AguardandoResposta itens={emAberto} podeEscrever={podeEscrever} />

      {lista.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-zinc-500">
            Nenhum cliente para hoje.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {lista.map((c) => {
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
                    ? `combinado para ${formatDateBR(c.combinado.adiarAte)}${
                        c.combinado.observacao ? ` — “${c.combinado.observacao}”` : ""
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
        })}
      </div>

      <p className="text-xs text-zinc-500">
        A lista tem alvo de {TAMANHO_LISTA} clientes por dia. {totalReativacao} inativos aguardam
        reativação — na cota atual, o backlog é percorrido por inteiro em algumas semanas.
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
                {a.cliente && <LinkCliente id={a.cliente.id} nome={a.cliente.nome} />}
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
