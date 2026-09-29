-- O ciclo de recompra passa a olhar as últimas 8 compras, não a vida inteira.
--
-- "Por que ele não mandou eu chamar esse cliente?" — Banca do Inglês, 24
-- compras, parado há 27 dias, e fora da lista. O motivo: a mediana dos
-- intervalos saía de TODO o histórico, de 2023 pra cá, incluindo sumiços de
-- 120, 159 e 317 dias. Dava ciclo de 36 dias e previsão de compra pro dia
-- 08/10. Mas o comportamento dele em 2026 é outro: compra a cada 20 a 30
-- dias. Pelas últimas 8 compras o ciclo é 25, e ele venceu dia 27/09.
--
-- Cliente antigo carrega sumiço antigo pra sempre, e quanto mais tempo de
-- casa, mais o sistema erra a mão com ele — o contrário do que devia.
--
-- Efeito medido antes de aplicar: 5 clientes vivos entram na lista (entre
-- eles a Dolce, a ZVC e o próprio Gilberto), 13 saem porque hoje compram mais
-- espaçado, 21 mudam de status — 6 deles voltando de 'inativo' pra
-- 'atrasado', ou seja, ressuscitando na tela.

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
  -- Quantos intervalos entre compras entram no cálculo do ciclo.
  --
  -- Medido em COMPRAS e não em dias de propósito: a janela se ajusta sozinha
  -- ao ritmo de cada cliente — uns dois meses pra quem compra toda semana,
  -- uns oito pra quem compra por mês.
  janela_gaps constant int := 8;
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
    select cliente_id, data,
           (data - lag(data) over (partition by cliente_id order by data)) as gap
    from public.vendas_pedidos
    where cliente_id is not null and eh_valido
  ),
  -- Só os intervalos mais recentes.
  --
  -- A mediana saía da vida inteira do cliente, e cliente antigo carrega
  -- sumiços antigos. O Gilberto (Banca do Inglês) tem 24 compras desde 2023,
  -- com buracos de 120, 159 e 317 dias lá atrás: mediana de tudo = 36 dias.
  -- Só que em 2026 ele compra a cada 20 ou 30 — mediana das últimas 8 = 25.
  -- Com 36, o sistema previa o próximo pedido pra 08/10 e não punha ele na
  -- lista; com 25, ele venceu dia 27/09. O vendedor ligou por conta própria e
  -- o sistema ficou calado, que é o pior lugar pra ele estar.
  gaps_recentes as (
    select cliente_id, gap
    from (
      select cliente_id, gap,
             row_number() over (partition by cliente_id order by data desc) as rn
      from gaps where gap is not null
    ) t
    where rn <= janela_gaps
  ),
  med as (
    select cliente_id, percentile_cont(0.5) within group (order by gap)::int as intervalo
    from gaps_recentes group by cliente_id
  ),
  calc as (
    select b.cliente_id, b.freq, b.total_vendas, b.primeira, b.ultima,
           case when b.freq >= 3 then m.intervalo end as intervalo,
           -- Com 2 compras, o intervalo entre elas é o único sinal de ritmo.
           case when b.freq = 2 and b.span > 0 then b.span::int end as ciclo_de_duas,
           (current_date - b.ultima) as recencia
    from base b left join med m on m.cliente_id = b.cliente_id
  ),
  -- Julga o cliente UMA vez, e todo o resto lê daqui.
  --
  -- Antes status e contatar_3dias eram dois cases independentes, e eles
  -- discordavam: o status dizia "atrasado" enquanto contatar_3dias dizia
  -- false. Quem caía nessa fresta sumia das duas pontas — da fila, porque
  -- não era pra contatar; da cota de reativação, porque ela só recolhe
  -- 'inativo' e 'sem_padrao'. Eram 10 clientes e R$ 223 mil de receita
  -- anual, entre eles os de maior frequência da carteira.
  julgado as (
    select k.*,
      case
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
        else 'sem_padrao' end as st
    from calc k
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
    status = k.st,
    -- Atrasado é pra ligar. Sempre.
    --
    -- A regra antiga era "vencido E recencia <= 2 * intervalo": quanto MAIS
    -- atrasado o cliente ficava, mais o sistema o escondia. Um cliente
    -- semanal com 123 compras parado há 30 dias saía da lista justamente no
    -- mês em que estava indo embora. Agora quem está atrasado fica na fila
    -- até virar inativo, e aí a cota de reativação assume — sem fresta
    -- entre as duas.
    contatar_3dias = case
      when k.st = 'atrasado' then true
      when k.intervalo is null then
        (k.ultima is not null
         and (k.ultima + ciclo_presumido) <= current_date + 3
         and k.recencia <= limite_novo)
      when (k.ultima + k.intervalo) between current_date and current_date + 3 then true
      else false end,
    motivo_contato = case
      when k.st = 'atrasado' then 'vencido (passou do ciclo)'
      when k.intervalo is null then
        (case when k.ultima is not null
                and (k.ultima + ciclo_presumido) <= current_date + 3
                and k.recencia <= limite_novo
              then 'cliente novo (ciclo ainda não definido)' end)
      when (k.ultima + k.intervalo) between current_date and current_date + 3
        then 'previsto nos proximos 3 dias'
      else null end,
    atualizado_em = now()
  from julgado k
  where c.id = k.cliente_id;

  get diagnostics afetados = row_count;

  update public.vendas_clientes
  set status = 'sem_padrao', contatar_3dias = false, motivo_contato = null,
      intervalo_mediano_dias = null, data_prevista_compra = null,
      frequencia_compras = 0, total_vendas = 0, ticket_medio = 0, atualizado_em = now()
  where id not in (select distinct cliente_id from public.vendas_pedidos
                   where cliente_id is not null and eh_valido);

  return afetados;
end $function$
;
