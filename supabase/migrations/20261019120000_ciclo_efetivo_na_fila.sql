-- Cliente de 2 compras com ciclo calculado ficava fora da fila.
--
-- A vigia apontou S E CONVENIENCIAS LTDA hoje: ativo, 2 compras, ciclo de 7
-- dias, previsto pra comprar em 22/10 — e fora de todas as listas.
--
-- A carteira estava partida ao meio. `status`, `intervalo_mediano_dias` e
-- `data_prevista_compra` já consideravam o ciclo de quem tem 2 compras. Só
-- `contatar_3dias` continuava olhando apenas `intervalo`, que existe a partir
-- de 3 compras. Com `intervalo` nulo, a fila caía na presunção de "cliente
-- novo" (10 dias fixos) — que discorda do ciclo que o próprio sistema
-- calculou — e o cliente não entrava. Também não entrava na reativação,
-- porque reativação só recolhe inativo e sem_padrao.
--
-- É o mesmo defeito de família das outras três vezes: duas decisões sobre o
-- mesmo cliente, calculadas em lugares diferentes, que discordam. Agora o
-- ciclo nasce UMA vez (`ciclo_efetivo`) e os quatro campos leem dele.
--
-- O `status` segue com dois ramos de propósito: o piso de 30 dias antes de
-- declarar inativo só vale pra quem tem mediana medida. Mexer nele mudaria a
-- classificação de 23 clientes que ninguém pediu pra mexer.

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
  -- Com 2 compras, o intervalo entre elas é o único sinal de ritmo — mas só
  -- até certo ponto. Passando disso não é ritmo, é coincidência: duas compras
  -- separadas por 637 dias davam um "ciclo" de 637 dias, e o cliente ficava
  -- 'ativo' até 2028 sem entrar em lista nenhuma. Acima do teto, trata como
  -- quem não tem padrão: vai pra cota de reativação, que é onde se alcança
  -- quem sumiu.
  teto_ciclo_de_duas constant int := 45;
BEGIN
  -- Recalcular a carteira é coisa de quem importa as vendas. Sem sessão
  -- (cron, rotina interna do banco) auth.uid() é nulo e passa — o anônimo,
  -- que também teria auth.uid() nulo, já foi barrado no GRANT no fim do arquivo.
  IF auth.uid() IS NOT NULL
     AND NOT public.tem_papel_vendas(array['aprovador','vendas']) THEN
    RAISE EXCEPTION 'Sem permissão para recalcular a carteira.'
      USING errcode = '42501';
  END IF;
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
           case when b.freq = 2 and b.span > 0 and b.span <= teto_ciclo_de_duas
                then b.span::int end as ciclo_de_duas,
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
      -- O ciclo que vale pra ESTE cliente, calculado uma vez só.
      --
      -- Era aqui que a carteira se partia: status, data prevista e intervalo
      -- já consideravam o ciclo de quem tem 2 compras, mas contatar_3dias
      -- olhava só `intervalo` (que existe a partir de 3 compras). Resultado:
      -- cliente de 2 compras com ciclo de 7 dias, previsto pra daqui a 3,
      -- ficava fora da fila — e fora da reativação, porque não é inativo.
      -- Era o terceiro bug da mesma família, e a vigia pegou no mesmo dia.
      coalesce(k.intervalo, k.ciclo_de_duas) as ciclo_efetivo,
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
    -- Grava também o ciclo de quem só tem 2 compras.
    --
    -- Antes ele era calculado, usado pra decidir o status e jogado fora. O
    -- resto do sistema não enxergava: sem intervalo e sem data prevista, o
    -- cliente ficava 'ativo' sem ninguém saber dizer até quando — foi assim
    -- que a Diverso Cultural (compras em 16/09 e 02/10, ciclo de 16 dias)
    -- caiu fora de todas as listas e acendeu o alerta vermelho.
    --
    -- Continua valendo que 2 compras é sinal fraco: o teto de 45 dias segue
    -- de pé, e acima dele não vira ciclo nenhum.
    intervalo_mediano_dias = k.ciclo_efetivo,
    data_prevista_compra   = case
                               when k.ciclo_efetivo is not null then k.ultima + k.ciclo_efetivo
                             end,
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
      -- Sem ciclo nenhum (1 compra): vale a presunção do cliente novo.
      when k.ciclo_efetivo is null then
        (k.ultima is not null
         and (k.ultima + ciclo_presumido) <= current_date + 3
         and k.recencia <= limite_novo)
      when (k.ultima + k.ciclo_efetivo) between current_date and current_date + 3 then true
      else false end,
    motivo_contato = case
      when k.st = 'atrasado' then 'vencido (passou do ciclo)'
      when k.ciclo_efetivo is null then
        (case when k.ultima is not null
                and (k.ultima + ciclo_presumido) <= current_date + 3
                and k.recencia <= limite_novo
              then 'cliente novo (ciclo ainda não definido)' end)
      when (k.ultima + k.ciclo_efetivo) between current_date and current_date + 3
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
end $function$;
