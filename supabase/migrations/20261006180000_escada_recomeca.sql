-- A escada de tentativas recomeça hoje.
--
-- A contagem de "quantas vezes já chamei este cliente" vinha somando cliques
-- do sistema antigo, onde registrar contato era só "mandei mensagem" e não
-- virava tentativa de nada. Com a regra nova isso punia quem não merecia: 18
-- clientes saíram da lista diária por 4 a 8 cliques acumulados em meses — ZVC,
-- Juliana Modestti, Lord Rest, Elaine Antunes, justamente os que estavam com
-- conversa aberta no WhatsApp — e outros 21 só voltariam de 8 em 8 dias.
--
-- escada_desde é o marco: a contagem só olha contatos a partir dele. Fica como
-- coluna, e não como data fixa no código, porque serve duas vezes — zera todo
-- mundo agora, e depois permite dar outra chance a um cliente específico sem
-- apagar nada.
--
-- Nenhum contato é apagado. O histórico de conversa continua inteiro no
-- cadastro de cada cliente; o que recomeça é só a contagem de insistência.
alter table vendas_clientes
  add column if not exists escada_desde date;

comment on column vendas_clientes.escada_desde is
  'A partir de quando contar tentativas de contato. Null = contar tudo desde a última compra. Serve para dar um recomeço sem apagar histórico.';

update vendas_clientes
   set escada_desde = (now() at time zone 'America/Sao_Paulo')::date
 where escada_desde is null;

-- A view passa a respeitar o marco.
--
-- Duas condições e não um greatest(): o corte da compra é "depois dela" e o do
-- marco é "a partir dele". O clique de hoje precisa contar como a primeira
-- tentativa, não ficar de fora do próprio recomeço.
create or replace view vendas_ultimo_contato
with (security_invoker = true) as
select distinct on (k.cliente_id)
  k.cliente_id,
  k.id            as contato_id,
  k.resultado,
  k.adiar_ate,
  k.observacao,
  k.motivo,
  k.criado_em,
  k.atualizado_em,
  k.concluido_em,
  k.combinado_com_cliente,
  (
    select count(*)
    from vendas_contatos t
    join vendas_clientes cc on cc.id = t.cliente_id
    where t.cliente_id = k.cliente_id
      and (cc.ultima_compra is null
           or (t.criado_em at time zone 'America/Sao_Paulo')::date > cc.ultima_compra)
      and (cc.escada_desde is null
           or (t.criado_em at time zone 'America/Sao_Paulo')::date >= cc.escada_desde)
  )::int as tentativas
from vendas_contatos k
where k.cliente_id is not null
order by k.cliente_id, k.criado_em desc, k.id desc;

-- Os contatos de hoje foram gravados com a contagem velha e saíram com prazo
-- de 8 dias quando deviam ter 2. Reescreve pelo degrau certo.
begin;
alter table vendas_contatos disable trigger trg_vendas_contatos_trava_correcao;

update vendas_contatos
   set adiar_ate = (criado_em at time zone 'America/Sao_Paulo')::date + 2
 where resultado = 'falado'
   and (criado_em at time zone 'America/Sao_Paulo')::date
       = (now() at time zone 'America/Sao_Paulo')::date;

alter table vendas_contatos enable trigger trg_vendas_contatos_trava_correcao;
commit;
