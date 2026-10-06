-- Um clique passa a ser o ato inteiro.
--
-- Em 30 dias: 443 contatos registrados, 191 com desfecho informado. 252 nunca
-- foram classificados — 57%. Não é desleixo, é o desenho: quem está vendendo
-- está no WhatsApp, não nesta tela, e quem vier depois também vai estar.
--
-- O estrago não era o campo vazio, era o que o sistema fazia com ele. Sem
-- desfecho, ele inventava uma data de retorno e depois mostrava o próprio
-- palpite como "retorno combinado", como se o cliente tivesse prometido. Dos
-- 107 combinados vencidos hoje, 68 (64%) são invenção — e, como "combinado"
-- vem no topo da lista, essas 68 invenções passavam na frente de quem de fato
-- está vencendo o ciclo de compra.
--
-- Duas mudanças no modelo:
--
-- 1) 'falado' é um resultado de verdade: "falei com ele, ele ainda não
--    respondeu". É honesto e não pede continuação. 'sem_resposta' continua
--    existindo pros 334 registros antigos e pra quem quiser usar.
--
-- 2) combinado_com_cliente separa o que foi acordado do que a máquina chutou.
--    Só é true quando uma pessoa escolheu a data. É o que permite a tela parar
--    de chamar palpite de promessa.
alter table vendas_contatos
  drop constraint if exists vendas_contatos_resultado_valido;

alter table vendas_contatos
  add constraint vendas_contatos_resultado_valido check (
    resultado is null
    or resultado = any (array[
      'falado', 'vai_comprar', 'comprou', 'nao_agora', 'sem_resposta', 'recusou'
    ])
  );

alter table vendas_contatos
  add column if not exists combinado_com_cliente boolean not null default false;

comment on column vendas_contatos.combinado_com_cliente is
  'True só quando uma pessoa escolheu a data de retorno. False = prazo calculado pelo sistema, que não pode ser apresentado como combinado.';

-- O histórico também mentia, e continuaria mentindo na tela.
--
-- Marca como combinado de verdade só o que tem desfecho informado E uma data
-- que não bate com o prazo automático do resultado. Quem escolheu a mesma data
-- que o sistema sugeriria é indistinguível de quem só salvou o formulário — e
-- nesse empate o certo é não afirmar que houve acordo.
-- A trava de 7 dias protege contra gente reescrever conversa velha. Aqui o
-- resultado não muda: só se carimba se a data foi acordada ou chutada, que é
-- informação que nunca existiu. Suspensa dentro da transação e religada nela.
begin;
alter table vendas_contatos disable trigger trg_vendas_contatos_trava_correcao;

update vendas_contatos v
   set combinado_com_cliente = true
 where v.concluido_em is not null
   and v.adiar_ate is not null
   and v.resultado in ('vai_comprar', 'nao_agora', 'recusou')
   and v.adiar_ate <> (v.criado_em at time zone 'America/Sao_Paulo')::date + case v.resultado
         when 'vai_comprar' then 2
         when 'nao_agora'   then 14
         when 'recusou'     then 90
       end;

alter table vendas_contatos enable trigger trg_vendas_contatos_trava_correcao;
commit;
