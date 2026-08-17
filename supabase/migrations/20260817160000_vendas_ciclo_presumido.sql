-- Cliente novo nunca era chamado.
--
-- recalcular_metricas_vendas() só calcula o ciclo com 3 compras ou mais. Abaixo
-- disso, intervalo fica nulo — e a regra dizia `when intervalo is null then
-- false`, ou seja, o cliente NUNCA entrava na fila de hoje. São 135 clientes
-- ativos (30% da base) invisíveis pro trabalho diário: compram uma vez e
-- ninguém liga de volta.
--
-- Agora, sem histórico pra prever, presume-se ciclo de 10 dias. O cliente entra
-- na fila a partir do 7º dia (3 de antecedência, como todo mundo) e sai no 20º
-- se não comprar — mesma ideia do corte de 2× o ciclo que já vale pros demais.
-- Sem esse teto, os 108 clientes parados há mais de 20 dias (alguns há 3 anos)
-- entupiriam a fila de uma vez.
--
-- Só contatar_3dias e motivo_contato mudam. status continua como estava, pra
-- não reclassificar 135 clientes de uma vez sem ninguém pedir.

CREATE OR REPLACE FUNCTION public.recalcular_metricas_vendas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  afetados integer;
  -- Ciclo assumido pra quem ainda não tem histórico suficiente.
  ciclo_presumido constant int := 10;
  -- Depois disso o cliente novo sai da fila e vira caso de reativação.
  limite_novo constant int := 20;
begin
  with base as (
    select cliente_id, count(*) as freq, sum(total) as total_vendas,
           min(data) as primeira, max(data) as ultima
    from public.vendas_pedidos
    where cliente_id is not null and eh_valido
    group by cliente_id
  ),
  gaps as (
    select cliente_id,
           (data - lag(data) over (partition by cliente_id order by data)) as gap
    from public.vendas_pedidos
    where cliente_id is not null and eh_valido
  ),
  med as (
    select cliente_id, percentile_cont(0.5) within group (order by gap)::int as intervalo
    from gaps where gap is not null group by cliente_id
  ),
  calc as (
    select b.cliente_id, b.freq, b.total_vendas, b.primeira, b.ultima,
           case when b.freq >= 3 then m.intervalo end as intervalo,
           (current_date - b.ultima) as recencia
    from base b left join med m on m.cliente_id = b.cliente_id
  )
  update public.vendas_clientes c set
    frequencia_compras     = k.freq,
    total_vendas           = coalesce(k.total_vendas, 0),
    ticket_medio           = case when k.freq > 0
                                  then round(coalesce(k.total_vendas,0) / k.freq, 2) else 0 end,
    primeira_compra        = k.primeira,
    ultima_compra          = k.ultima,
    intervalo_mediano_dias = k.intervalo,
    data_prevista_compra   = case when k.intervalo is not null then k.ultima + k.intervalo end,
    status = case
      -- poucos pedidos: sem previsão possivel, mas parado ha muito tempo E inativo
      when k.intervalo is null then
        (case when k.recencia > 30 then 'inativo' else 'ativo' end)
      when k.recencia > 30 and k.recencia > 2 * k.intervalo then 'inativo'
      when k.recencia > k.intervalo then 'atrasado'
      else 'ativo' end,
    contatar_3dias = case
      -- Cliente novo: ciclo presumido, com janela fechando no 20º dia.
      when k.intervalo is null then
        (k.ultima is not null
         and (k.ultima + ciclo_presumido) <= current_date + 3
         and k.recencia <= limite_novo)
      when (k.ultima + k.intervalo) between current_date and current_date + 3 then true
      when (k.ultima + k.intervalo) < current_date and k.recencia <= 2 * k.intervalo then true
      else false end,
    motivo_contato = case
      when k.intervalo is null then
        (case when k.ultima is not null
                and (k.ultima + ciclo_presumido) <= current_date + 3
                and k.recencia <= limite_novo
              then 'cliente novo (ciclo ainda não definido)' end)
      when (k.ultima + k.intervalo) between current_date and current_date + 3
        then 'previsto nos proximos 3 dias'
      when (k.ultima + k.intervalo) < current_date and k.recencia <= 2 * k.intervalo
        then 'vencido (passou do ciclo)'
      else null end,
    atualizado_em = now()
  from calc k
  where c.id = k.cliente_id;

  get diagnostics afetados = row_count;

  update public.vendas_clientes
  set status = 'sem_padrao', contatar_3dias = false, motivo_contato = null,
      intervalo_mediano_dias = null, data_prevista_compra = null,
      frequencia_compras = 0, total_vendas = 0, ticket_medio = 0, atualizado_em = now()
  where id not in (select distinct cliente_id from public.vendas_pedidos
                   where cliente_id is not null and eh_valido);

  return afetados;
end $function$;
