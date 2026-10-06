-- O último contato passa a dizer duas coisas novas: se a data foi acordada
-- com o cliente, e quantas vezes já se tentou desde a última compra dele.
--
-- A contagem de tentativas é o que permite a lista parar de repetir
-- indefinidamente: 1ª tentativa volta em 2 dias, 2ª em 4, 3ª em 8, e quem
-- passa da 4ª sai da lista diária e vira trabalho de outra natureza — visita,
-- desconto, ou parar. Hoje isso dependia de alguém anotar; agora sai dos
-- fatos que o sistema já tem.
--
-- Colunas no fim: create or replace view não deixa reordenar.
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
  -- Tentativas desde a última compra. Comprou, zera: o assunto se resolveu.
  (
    select count(*)
    from vendas_contatos t
    join vendas_clientes cc on cc.id = t.cliente_id
    where t.cliente_id = k.cliente_id
      and (cc.ultima_compra is null
           or (t.criado_em at time zone 'America/Sao_Paulo')::date > cc.ultima_compra)
  )::int as tentativas
from vendas_contatos k
where k.cliente_id is not null
order by k.cliente_id, k.criado_em desc, k.id desc;
