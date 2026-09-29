-- Vigia: todo cliente ativo tem que ter um motivo com nome pra não ser
-- chamado hoje.
--
-- Em uma semana, três bugs diferentes produziram o mesmo sintoma — cliente
-- vivo fora de todas as listas: combinado velho que calava pra sempre;
-- 'atrasado' que caía na fresta entre a fila e a reativação; ciclo calculado
-- sobre sumiços de 2023. Nenhum deu erro. Os três foram descobertos porque o
-- vendedor reparou a falta olhando o WhatsApp.
--
-- Esta view não repete a regra do plano do dia — se repetisse, erraria junto.
-- Ela cobra uma propriedade que tem que valer seja qual for a regra: todo
-- cliente ativo está em UM destes estados, e quem não está em nenhum é
-- 'INVISIVEL'. Bug novo, causa nova, mesmo sintoma: aparece aqui no mesmo dia.
create or replace view vendas_cobertura_clientes
with (security_invoker = true) as
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d)
select
  c.id,
  c.nome,
  c.status,
  c.contatar_3dias,
  c.dias_contato,
  c.ultima_compra,
  c.intervalo_mediano_dias,
  c.data_prevista_compra,
  c.receita_anual_risco,
  u.adiar_ate,
  u.resultado as ultimo_resultado,
  (select d from hoje) - c.ultima_compra as parado_ha,
  case
    -- Ele respondeu e ficou combinado voltar noutro dia. Motivo e data existem.
    -- Pelo ÚLTIMO contato, não por qualquer um: foi confundir os dois que fez
    -- um "não agora" de duas semanas atrás calar cliente falado ontem.
    when u.adiar_ate > (select d from hoje) then 'silenciado'
    -- Agenda escolhida pelo vendedor manda sobre o ciclo.
    when c.dias_contato is not null
         and extract(isodow from (select d from hoje))::int = any(c.dias_contato)
      then 'na_lista'
    when c.dias_contato is not null then 'agenda_propria'
    when c.contatar_3dias then 'na_lista'
    -- Parado demais: a cota de reativação é quem alcança.
    when c.status in ('inativo', 'sem_padrao') then 'reativacao'
    -- Comprando no ritmo e ainda longe da próxima: esperar é o certo.
    when c.status = 'ativo'
         and c.data_prevista_compra is not null
         and c.data_prevista_compra > (select d from hoje) + 3
      then 'aguardando_ciclo'
    when c.ultima_compra is null then 'nunca_comprou'
    else 'INVISIVEL'
  end as estado
from vendas_clientes c
left join vendas_ultimo_contato u on u.cliente_id = c.id
where c.ativo;

comment on view vendas_cobertura_clientes is
  'Um estado com nome pra cada cliente ativo. estado = INVISIVEL significa que ninguém vai falar com ele e o sistema não sabe dizer por quê — é bug, não é decisão.';

grant select on vendas_cobertura_clientes to authenticated;
