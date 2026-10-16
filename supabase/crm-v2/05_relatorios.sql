-- CRM Panas · 05 · Relatórios
-- Tudo somado no banco: a tela lê poucas linhas e nenhum teto de 1000 alcança.

-- Quadro do funil: quantas e quanto em cada etapa, com valor ponderado.
create view crm_funil_resumo with (security_invoker = true) as
select e.funil_id, e.id as etapa_id, e.nome as etapa, e.ordem, e.tipo, e.probabilidade,
       count(o.id)::int                                        as oportunidades,
       coalesce(sum(o.valor), 0)                               as valor,
       coalesce(sum(o.valor * e.probabilidade / 100), 0)       as valor_ponderado
  from crm_etapas e
  left join crm_oportunidades o
         on o.etapa_id = e.id
        and (o.fechada_em is null
             or (o.fechada_em at time zone 'America/Sao_Paulo')::date
                >= date_trunc('week', crm_hoje())::date)
 group by e.funil_id, e.id, e.nome, e.ordem, e.tipo, e.probabilidade;

-- Conversão da recompra por semana. "Pediu sem contato" é o grupo de comparação:
-- sem ele, não dá para separar o efeito do contato de quem ia comprar de qualquer jeito.
create view crm_conversao_recompra with (security_invoker = true) as
with ops as (
  select o.id, date_trunc('week', o.aberta_em at time zone 'America/Sao_Paulo')::date as semana,
         e.tipo,
         exists (select 1 from crm_atividades a
                  where a.oportunidade_id = o.id and a.status = 'feita') as contatada
    from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id
   where o.funil_id = 'recompra'
)
select semana,
       count(*)::int                                              as previstas,
       count(*) filter (where contatada)::int                     as contatadas,
       count(*) filter (where tipo = 'ganha' and contatada)::int  as pediu_com_contato,
       count(*) filter (where tipo = 'ganha' and not contatada)::int as pediu_sem_contato,
       count(*) filter (where tipo = 'perdida')::int              as sem_pedido
  from ops group by semana;

-- Placar da semana: faturamento, pedidos, clientes que compraram e a meta.
create view crm_placar_semana with (security_invoker = true) as
with semanas as (
  select generate_series(date_trunc('week', crm_hoje() - 77), date_trunc('week', crm_hoje()),
                         interval '7 days')::date as semana
)
select s.semana,
       coalesce(sum(p.total), 0)              as faturamento,
       count(p.pedido)::int                   as pedidos,
       count(distinct p.cliente_id)::int      as clientes_que_compraram,
       (select count(*) from crm_situacao_diaria d
         where d.dia = s.semana and d.situacao in ('ativo','atrasado'))::int as carteira_ativa,
       m.faturamento                          as meta
  from semanas s
  left join vendas_pedidos p on p.eh_valido and p.data >= s.semana and p.data < s.semana + 7
  left join crm_metas m on m.semana = s.semana
 group by s.semana, m.faturamento;

-- Previsão da semana: o que está aberto no funil, ponderado pela etapa.
create view crm_previsao_semana with (security_invoker = true) as
select o.funil_id,
       count(*)::int                                     as oportunidades,
       coalesce(sum(o.valor), 0)                         as valor,
       coalesce(sum(o.valor * e.probabilidade / 100), 0) as previsto
  from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id
 where o.fechada_em is null
   and (o.funil_id <> 'recompra' or o.ciclo_ref < date_trunc('week', crm_hoje())::date + 7)
 group by o.funil_id;

-- Movimento da carteira: quem mudou de situação entre ontem e hoje.
create view crm_movimento_carteira with (security_invoker = true) as
select h.conta_id, c.nome, o.situacao as antes, h.situacao as agora, h.dia
  from crm_situacao_diaria h
  join crm_situacao_diaria o on o.conta_id = h.conta_id and o.dia = h.dia - 1
  join crm_contas c on c.id = h.conta_id
 where h.situacao <> o.situacao;
