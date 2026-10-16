-- Fecha a execução anônima das funções que leem e recalculam a carteira.
--
-- As cinco eram SECURITY DEFINER — rodam com os direitos do dono e ignoram RLS —
-- e o Postgres dá EXECUTE a PUBLIC por padrão, que o Supabase ainda estende
-- explicitamente a anon. Conferido em 16/10/2026: sem login, só com a chave
-- pública que vai embutida no site, POST /rest/v1/rpc/vendas_oportunidades
-- devolvia HTTP 200 com 228 linhas (código do cliente, produto, quantas vezes
-- comprou, há quantos dias parou). As quatro recalcular_* gravam no banco e
-- também aceitavam chamada anônima: qualquer um na internet podia disparar
-- recálculo pesado em sequência. Nenhuma conferia quem chamava.
--
-- Duas camadas, porque cada uma cobre o que a outra não vê:
--
-- 1) GRANT: anon e PUBLIC perdem EXECUTE. É a única trava que funciona contra
--    o anônimo — para ele auth.uid() é nulo, igual ao do cron, e uma checagem
--    por auth.uid() deixaria ele passar.
-- 2) Papel dentro da função: usuário logado sem papel de vendas (motorista,
--    estoquista) é recusado. vendas_oportunidades devolve vazio para ele;
--    recalcular_* levanta erro antes de gravar qualquer coisa.
--
-- O cron das 5h roda como postgres, sem sessão: auth.uid() nulo, passa direto,
-- como antes. Gatilhos e as funções de papel usadas pelas próprias policies
-- (current_user_role, tem_papel_vendas) não foram tocados: gatilho não é
-- chamável por RPC, e as de papel precisam continuar abertas para a RLS.

CREATE OR REPLACE FUNCTION public.vendas_oportunidades()
 RETURNS TABLE(cliente_id uuid, produto text, vezes integer, dias_sem_pedir integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH por_produto AS (
    SELECT p.cliente_id,
           i.produto,
           count(*)::int AS vezes,
           (current_date - max(p.data))::int AS dias_sem_pedir
      FROM public.vendas_pedidos p
      JOIN public.vendas_itens i ON i.pedido = p.pedido
     WHERE p.eh_valido AND i.eh_produto AND p.cliente_id IS NOT NULL
     GROUP BY p.cliente_id, i.produto
  ),
  candidatos AS (
    SELECT pp.*,
           row_number() OVER (PARTITION BY pp.cliente_id ORDER BY pp.vezes DESC) AS rn
      FROM por_produto pp
      JOIN public.vendas_clientes c ON c.id = pp.cliente_id
     WHERE c.intervalo_mediano_dias IS NOT NULL
       -- Hábito de verdade, não compra avulsa.
       AND pp.vezes >= 5
       -- Parou por mais de 3 ciclos: fora da variação normal.
       AND pp.dias_sem_pedir > c.intervalo_mediano_dias * 3
  )
  SELECT cliente_id, produto, vezes, dias_sem_pedir
    FROM candidatos
   WHERE rn = 1
     -- Só quem trabalha a carteira. Sem o papel, a função devolve vazio em vez
     -- de erro: a tela de vendas já é bloqueada antes, isto é a trava do banco.
     AND public.tem_papel_vendas(array['aprovador','vendas','comprador']);
$function$;

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
    intervalo_mediano_dias = coalesce(k.intervalo, k.ciclo_de_duas),
    data_prevista_compra   = case
                               when k.intervalo is not null then k.ultima + k.intervalo
                               when k.ciclo_de_duas is not null then k.ultima + k.ciclo_de_duas
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
end $function$;

CREATE OR REPLACE FUNCTION public.recalcular_itens_habituais()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
BEGIN
  -- Recalcular a carteira é coisa de quem importa as vendas. Sem sessão
  -- (cron, rotina interna do banco) auth.uid() é nulo e passa — o anônimo,
  -- que também teria auth.uid() nulo, já foi barrado no GRANT no fim do arquivo.
  IF auth.uid() IS NOT NULL
     AND NOT public.tem_papel_vendas(array['aprovador','vendas']) THEN
    RAISE EXCEPTION 'Sem permissão para recalcular a carteira.'
      USING errcode = '42501';
  END IF;
  with top as (
    select cliente_id, produto, qtd, rn from (
      select p.cliente_id, i.produto, sum(i.qtd) as qtd,
             row_number() over (partition by p.cliente_id order by sum(i.qtd) desc) as rn
      from public.vendas_itens i
      join public.vendas_pedidos p on p.pedido = i.pedido
      where i.eh_produto and p.cliente_id is not null
      group by p.cliente_id, i.produto
    ) t where rn <= 5
  ),
  agg as (
    select cliente_id,
           jsonb_agg(jsonb_build_object('produto', produto, 'qtd', qtd) order by rn) as itens
    from top group by cliente_id
  )
  update public.vendas_clientes c set itens_habituais = a.itens
  from agg a where c.id = a.cliente_id;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.recalcular_frequencia_classe()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE afetados integer;
BEGIN
  -- Recalcular a carteira é coisa de quem importa as vendas. Sem sessão
  -- (cron, rotina interna do banco) auth.uid() é nulo e passa — o anônimo,
  -- que também teria auth.uid() nulo, já foi barrado no GRANT no fim do arquivo.
  IF auth.uid() IS NOT NULL
     AND NOT public.tem_papel_vendas(array['aprovador','vendas']) THEN
    RAISE EXCEPTION 'Sem permissão para recalcular a carteira.'
      USING errcode = '42501';
  END IF;
  WITH janela AS (
    SELECT c.id,
           count(*) FILTER (WHERE p.data >= current_date - 90)  AS d90,
           count(*) FILTER (WHERE p.data >= current_date - 120) AS d120,
           max(p.data) AS ultima
      FROM public.vendas_clientes c
      LEFT JOIN public.vendas_pedidos p
        ON p.cliente_id = c.id AND p.eh_valido
     WHERE c.ativo
     GROUP BY c.id
  )
  UPDATE public.vendas_clientes c
     SET frequencia_classe = CASE
           WHEN j.ultima IS NULL OR j.ultima < current_date - 120 THEN 'inativo'
           WHEN j.d90 / 3.0 >= 5 THEN 'frequente'
           WHEN j.d90 / 3.0 >= 2 THEN 'media'
           WHEN j.d90 / 3.0 >= 1 THEN 'baixa'
           ELSE 'sazonal'
         END
    FROM janela j
   WHERE c.id = j.id;

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RETURN afetados;
END $function$;

CREATE OR REPLACE FUNCTION public.recalcular_dia_pedido_habitual()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
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
    select cliente_id,
           extract(isodow from data)::smallint as dia,
           count(*) as qtd
    from vendas_pedidos
    where eh_valido
      and cliente_id is not null
      and data >= current_date - interval '12 months'
      and extract(isodow from data) between 1 and 5
    group by 1, 2
  ),
  tot as (select cliente_id, sum(qtd) as total from base group by 1),
  dominante as (
    select distinct on (b.cliente_id)
           b.cliente_id, b.dia, b.qtd, t.total
    from base b
    join tot t on t.cliente_id = b.cliente_id
    order by b.cliente_id, b.qtd desc, b.dia
  )
  update vendas_clientes c
  set dia_pedido_habitual = case
        when d.total >= 4 and d.qtd::numeric / d.total >= 0.35 then d.dia
        else null
      end
  from dominante d
  where d.cliente_id = c.id;

  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke execute on function public.vendas_oportunidades() from public, anon;
grant execute on function public.vendas_oportunidades() to authenticated, service_role;

revoke execute on function public.recalcular_metricas_vendas() from public, anon;
grant execute on function public.recalcular_metricas_vendas() to authenticated, service_role;

revoke execute on function public.recalcular_itens_habituais() from public, anon;
grant execute on function public.recalcular_itens_habituais() to authenticated, service_role;

revoke execute on function public.recalcular_frequencia_classe() from public, anon;
grant execute on function public.recalcular_frequencia_classe() to authenticated, service_role;

revoke execute on function public.recalcular_dia_pedido_habitual() from public, anon;
grant execute on function public.recalcular_dia_pedido_habitual() to authenticated, service_role;
