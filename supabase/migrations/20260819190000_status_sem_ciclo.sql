-- Cliente de 1 compra não pode ser "inativo".
--
-- Quem tem menos de 3 compras não tem ciclo calculado, e o status caía numa
-- regra fixa: parado há mais de 30 dias => inativo. Isso marcava como inativo
-- quem comprou UMA vez e está há 34 dias parado — não dá pra dizer que alguém
-- quebrou um ritmo que nunca existiu. Eram 70 clientes nessa situação.
--
-- Agora:
--   1 compra  -> 'sem_padrao'. Não há sinal pra afirmar mais que isso.
--   2 compras -> o intervalo entre elas vira o ciclo presumido, e vale a mesma
--                regra dos demais (inativo só após 2x o próprio ritmo).
--
-- IMPORTANTE: 'sem_padrao' não pode virar limbo. A cota de reativação do plano
-- do dia passa a incluir esses clientes junto com os inativos — senão sairiam
-- de todas as listas e ninguém falaria com eles nunca mais.
CREATE OR REPLACE FUNCTION public.recalcular_metricas_vendas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  afetados integer;
  ciclo_presumido constant int := 10;
  limite_novo constant int := 20;
begin
  with base as (
    select cliente_id, count(*) as freq, sum(total) as total_vendas,
           min(data) as primeira, max(data) as ultima,
           (max(data) - min(data)) as span
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
           -- Com 2 compras, o intervalo entre elas é o único sinal de ritmo.
           case when b.freq = 2 and b.span > 0 then b.span::int end as ciclo_de_duas,
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
      when k.intervalo is not null then
        (case
          when k.recencia > 30 and k.recencia > 2 * k.intervalo then 'inativo'
          when k.recencia > k.intervalo then 'atrasado'
          else 'ativo' end)
      -- 2 compras: julga pelo intervalo entre elas, não por régua fixa.
      when k.ciclo_de_duas is not null then
        (case
          when k.recencia > 2 * k.ciclo_de_duas then 'inativo'
          when k.recencia > k.ciclo_de_duas then 'atrasado'
          else 'ativo' end)
      -- 1 compra: não há ritmo pra quebrar.
      else 'sem_padrao' end,
    contatar_3dias = case
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
