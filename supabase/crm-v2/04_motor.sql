-- CRM Panas · 04 · Motor
-- As regras que os números da operação provaram, agora num lugar só:
--   · o ciclo de cada cliente é a mediana dos 8 últimos intervalos;
--   · a oportunidade de recompra nasce sozinha 3 dias antes da data prevista;
--   · um clique registra o contato e agenda a volta: 2, 4, 8 dias;
--   · na 4ª tentativa sem pedido, a oportunidade fecha como perdida;
--   · quem fecha como ganha é o pedido importado do Queóps, não alguém marcando.

-- Toda função que muda dado confere o papel. Sem sessão (cron) auth.uid() é
-- nulo e passa; o anônimo não chega aqui porque não tem EXECUTE (bloco 02).
create or replace function crm_exigir_papel(p_papeis text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.tem_papel_vendas(p_papeis) then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

create or replace function crm_hoje()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Degrau da escada de acompanhamento: 1ª tentativa volta em 2 dias, 2ª em 4, 3ª em 8.
create or replace function crm_dias_escada(p_tentativa integer)
returns integer language sql immutable as $$
  select (array[2, 4, 8])[least(greatest(p_tentativa, 1), 3)];
$$;

-- Move a oportunidade e grava o histórico. Único caminho de mudança de etapa.
create or replace function crm_mover_etapa(p_oportunidade uuid, p_etapa uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_op crm_oportunidades;
  v_et crm_etapas;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  select * into v_op from crm_oportunidades where id = p_oportunidade for update;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  select * into v_et from crm_etapas where id = p_etapa;
  if not found or v_et.funil_id <> v_op.funil_id then
    raise exception 'Etapa não pertence ao funil desta oportunidade.';
  end if;
  if v_op.etapa_id = p_etapa then return; end if;

  update crm_oportunidades
     set etapa_id     = p_etapa,
         etapa_desde  = now(),
         fechada_em   = case when v_et.tipo = 'aberta' then null else now() end,
         motivo_perda = case when v_et.tipo = 'perdida' then coalesce(p_motivo, motivo_perda) end
   where id = p_oportunidade;

  insert into crm_oportunidade_etapas (oportunidade_id, etapa_de, etapa_para, por, motivo)
  values (p_oportunidade, v_op.etapa_id, p_etapa, auth.uid(), p_motivo);
end $$;

-- "Falei com ele." Um clique, e o resto é do sistema.
create or replace function crm_falei_com_ele(p_conta uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_ativ      uuid;
  v_op        crm_oportunidades;
  v_tentativa integer;
  v_etapa     uuid;
  v_ordem     smallint;
begin
  -- Um contato por conta por dia: clicar duas vezes não vale duas tentativas.
  select a.id into v_ativ from crm_atividades a
   where a.conta_id = p_conta and a.status = 'feita' and a.origem = 'pessoa'
     and (a.feita_em at time zone 'America/Sao_Paulo')::date = crm_hoje()
   limit 1;
  if found then return v_ativ; end if;

  -- A oportunidade aberta mais urgente: recompra, depois prospecção, depois reativação.
  select o.* into v_op from crm_oportunidades o
   where o.conta_id = p_conta and o.fechada_em is null
   order by case o.funil_id when 'recompra' then 1 when 'prospeccao' then 2 else 3 end
   limit 1;

  -- O contato atende o lembrete que o sistema tinha agendado.
  update crm_atividades set status = 'cancelada'
   where conta_id = p_conta and status = 'agendada' and origem = 'sistema';

  insert into crm_atividades (conta_id, oportunidade_id, tipo, status, feita_em, origem, usuario_id)
  values (p_conta, v_op.id, 'whatsapp', 'feita', now(), 'pessoa', auth.uid())
  returning id into v_ativ;

  if v_op.id is null then return v_ativ; end if;

  select count(*) into v_tentativa from crm_atividades
   where oportunidade_id = v_op.id and status = 'feita';

  if v_tentativa >= 4 then
    select id into v_etapa from crm_etapas where funil_id = v_op.funil_id and tipo = 'perdida';
    perform crm_mover_etapa(v_op.id, v_etapa, 'Sem pedido depois de 4 tentativas');
    return v_ativ;
  end if;

  -- Recompra e reativação andam sozinhas: 1º contato → Contatada, depois → Acompanhando.
  -- Na prospecção só o primeiro contato move; o resto é decisão de quem vende.
  select e.ordem into v_ordem from crm_etapas e where e.id = v_op.etapa_id;
  if v_op.funil_id in ('recompra','reativacao') then
    select id into v_etapa from crm_etapas
     where funil_id = v_op.funil_id and ordem = case when v_tentativa = 1 then 2 else 3 end;
    perform crm_mover_etapa(v_op.id, v_etapa);
  elsif v_ordem = 1 then
    select id into v_etapa from crm_etapas where funil_id = 'prospeccao' and ordem = 2;
    perform crm_mover_etapa(v_op.id, v_etapa);
  end if;

  insert into crm_atividades (conta_id, oportunidade_id, tipo, status, para, origem, tentativa)
  values (p_conta, v_op.id, 'whatsapp', 'agendada',
          crm_hoje() + crm_dias_escada(v_tentativa), 'sistema', v_tentativa + 1);

  return v_ativ;
end $$;

-- Desfaz o clique do dia: apaga o contato e o lembrete que ele gerou e devolve
-- a oportunidade à etapa anterior.
create or replace function crm_desfazer_contato(p_atividade uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_a crm_atividades;
  v_h crm_oportunidade_etapas;
begin
  select * into v_a from crm_atividades where id = p_atividade;
  if not found or v_a.origem <> 'pessoa' or v_a.status <> 'feita'
     or (v_a.feita_em at time zone 'America/Sao_Paulo')::date <> crm_hoje() then
    raise exception 'Só dá para desfazer o contato de hoje.';
  end if;
  delete from crm_atividades
   where conta_id = v_a.conta_id and origem = 'sistema' and status = 'agendada'
     and criado_em >= v_a.criado_em;
  if v_a.oportunidade_id is not null then
    select * into v_h from crm_oportunidade_etapas
     where oportunidade_id = v_a.oportunidade_id and em >= v_a.criado_em
     order by em limit 1;
    if found and v_h.etapa_de is not null then
      perform crm_mover_etapa(v_a.oportunidade_id, v_h.etapa_de, 'Contato desfeito');
    end if;
  end if;
  delete from crm_atividades where id = p_atividade;
end $$;

-- Números de cada conta a partir dos pedidos válidos.
create or replace function crm_recalcular_metricas()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  with pedidos as (
    select cliente_id as conta_id, data, total
      from vendas_pedidos where eh_valido and cliente_id is not null
  ),
  base as (
    select conta_id, count(*) as pedidos, sum(total) as faturamento,
           min(data) as primeira, max(data) as ultima
      from pedidos group by conta_id
  ),
  intervalos as (
    select conta_id, data, data - lag(data) over (partition by conta_id order by data) as gap
      from pedidos
  ),
  -- Os 8 intervalos mais recentes: cliente antigo não carrega sumiço antigo.
  recentes as (
    select conta_id, gap, row_number() over (partition by conta_id order by data desc) as rn
      from intervalos where gap is not null
  ),
  ciclo as (
    select conta_id, percentile_cont(0.5) within group (order by gap)::int as dias
      from recentes where rn <= 8 group by conta_id
  ),
  calc as (
    select b.*,
           case
             when b.pedidos >= 3 then c.dias
             -- Com 2 compras o intervalo é o único sinal; acima de 45 dias é coincidência.
             when b.pedidos = 2 and (b.ultima - b.primeira) between 1 and 45 then b.ultima - b.primeira
           end as ciclo_dias,
           crm_hoje() - b.ultima as recencia
      from base b left join ciclo c using (conta_id)
  )
  insert into crm_conta_metricas as m
    (conta_id, primeira_compra, ultima_compra, pedidos, faturamento, ticket_medio,
     ciclo_dias, prevista_em, situacao, receita_anual_risco, calculado_em)
  select k.conta_id, k.primeira, k.ultima, k.pedidos, k.faturamento,
         round(k.faturamento / k.pedidos, 2),
         k.ciclo_dias,
         k.ultima + k.ciclo_dias,
         case
           when k.ciclo_dias is null then 'sem_padrao'
           when k.recencia > 30 and k.recencia > 2 * k.ciclo_dias then 'inativo'
           when k.recencia > k.ciclo_dias then 'atrasado'
           else 'ativo'
         end,
         case when k.ciclo_dias > 0
              then round(k.faturamento / k.pedidos * 365.0 / k.ciclo_dias, 2) end,
         now()
    from calc k
    join crm_contas c on c.id = k.conta_id
  on conflict (conta_id) do update set
    primeira_compra     = excluded.primeira_compra,
    ultima_compra       = excluded.ultima_compra,
    pedidos             = excluded.pedidos,
    faturamento         = excluded.faturamento,
    ticket_medio        = excluded.ticket_medio,
    ciclo_dias          = excluded.ciclo_dias,
    prevista_em         = excluded.prevista_em,
    situacao            = excluded.situacao,
    receita_anual_risco = excluded.receita_anual_risco,
    calculado_em        = excluded.calculado_em;
  get diagnostics n = row_count;
  return n;
end $$;

-- A oportunidade de recompra nasce 3 dias antes da data prevista.
create or replace function crm_gerar_recompra()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  insert into crm_oportunidades (conta_id, funil_id, etapa_id, titulo, valor, criada_por, ciclo_ref)
  select c.id, 'recompra',
         (select id from crm_etapas where funil_id = 'recompra' and ordem = 1),
         'Recompra · prevista ' || to_char(m.prevista_em, 'DD/MM'),
         coalesce(m.ticket_medio, 0), 'sistema', m.prevista_em
    from crm_contas c
    join crm_conta_metricas m on m.conta_id = c.id
   where c.ativo and c.ciclo_de_vida = 'cliente'
     and m.situacao in ('ativo','atrasado')
     and m.prevista_em <= crm_hoje() + 3
     and not exists (select 1 from crm_oportunidades o
                      where o.conta_id = c.id and o.funil_id = 'recompra' and o.fechada_em is null)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Reativação: completa a cota diária com os inativos de maior receita em risco.
create or replace function crm_gerar_reativacao(p_cota integer default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_falta integer;
  n       integer;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  select greatest(p_cota - count(*), 0) into v_falta
    from crm_oportunidades where funil_id = 'reativacao' and fechada_em is null;

  insert into crm_oportunidades (conta_id, funil_id, etapa_id, titulo, valor, criada_por)
  select c.id, 'reativacao',
         (select id from crm_etapas where funil_id = 'reativacao' and ordem = 1),
         'Reativação', coalesce(m.ticket_medio, 0), 'sistema'
    from crm_contas c
    join crm_conta_metricas m on m.conta_id = c.id
   where c.ativo and c.ciclo_de_vida = 'cliente' and m.situacao = 'inativo'
     and not exists (select 1 from crm_oportunidades o
                      where o.conta_id = c.id and o.fechada_em is null)
     -- descartado há menos de 60 dias não volta à fila
     and not exists (select 1 from crm_oportunidades o
                      where o.conta_id = c.id and o.funil_id = 'reativacao'
                        and o.fechada_em > now() - interval '60 days')
   order by m.receita_anual_risco desc nulls last
   limit v_falta
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- O pedido importado fecha a oportunidade. Ninguém precisa marcar "ganha".
create or replace function crm_fechar_pelos_pedidos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  for r in
    select o.id as oportunidade, o.funil_id, o.conta_id, p.pedido
      from crm_oportunidades o
      join lateral (
        select v.pedido from vendas_pedidos v
         where v.cliente_id = o.conta_id and v.eh_valido
           and v.data >= (o.aberta_em at time zone 'America/Sao_Paulo')::date
         order by v.data limit 1
      ) p on true
     where o.fechada_em is null
  loop
    perform crm_mover_etapa(r.oportunidade,
      (select id from crm_etapas where funil_id = r.funil_id and tipo = 'ganha'), null);
    update crm_oportunidades set pedido_ganho = r.pedido where id = r.oportunidade;
    update crm_atividades set status = 'cancelada'
     where conta_id = r.conta_id and status = 'agendada' and origem = 'sistema';
    if r.funil_id = 'prospeccao' then
      update crm_contas set ciclo_de_vida = 'cliente', atualizado_em = now() where id = r.conta_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function crm_foto_diaria()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  insert into crm_situacao_diaria (dia, conta_id, situacao)
  select crm_hoje(), conta_id, situacao from crm_conta_metricas
  on conflict (dia, conta_id) do update set situacao = excluded.situacao;
  get diagnostics n = row_count;
  return n;
end $$;

-- Roda uma rotina e registra início, fim, linhas e erro.
create or replace function crm_rodar(p_rotina text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_n  integer;
begin
  perform crm_exigir_papel(array['aprovador','vendas']);
  insert into crm_rotinas (rotina) values (p_rotina) returning id into v_id;
  begin
    case p_rotina
      when 'metricas'   then v_n := crm_recalcular_metricas();
      when 'foto'       then v_n := crm_foto_diaria();
      when 'pedidos'    then v_n := crm_fechar_pelos_pedidos();
      when 'recompra'   then v_n := crm_gerar_recompra();
      when 'reativacao' then v_n := crm_gerar_reativacao();
      else raise exception 'Rotina desconhecida: %', p_rotina;
    end case;
    update crm_rotinas set fim = now(), status = 'ok', linhas = v_n where id = v_id;
  exception when others then
    update crm_rotinas set fim = now(), status = 'erro', erro = sqlerrm where id = v_id;
  end;
end $$;

-- Prospect novo num passo: conta, pessoa e oportunidade na Prospecção.
-- Só nome e telefone são obrigatórios. Telefone que já existe não vira conta nova.
create or replace function crm_criar_prospect(
  p_nome     text,
  p_telefone text,
  p_segmento text default null,
  p_origem   text default null,
  p_rota     text default 'a_definir')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_tel   text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_conta uuid;
  v_dono  text;
begin
  v_tel := case
             when length(v_tel) in (10, 11) then '+55' || v_tel
             when length(v_tel) in (12, 13) and v_tel like '55%' then '+' || v_tel
           end;
  if v_tel is null then
    raise exception 'Informe o telefone com DDD, por exemplo 51 99999-0000.';
  end if;
  select c.nome into v_dono from crm_pessoas p join crm_contas c on c.id = p.conta_id
   where p.telefone_e164 = v_tel limit 1;
  if found then
    raise exception 'Esse telefone já está cadastrado em %.', v_dono;
  end if;

  insert into crm_contas (nome, segmento_id, origem, rota, ciclo_de_vida, responsavel_id)
  values (trim(p_nome), p_segmento, p_origem, coalesce(p_rota, 'a_definir'), 'prospect', auth.uid())
  returning id into v_conta;
  insert into crm_pessoas (conta_id, nome, telefone_e164, principal)
  values (v_conta, null, v_tel, true);
  insert into crm_oportunidades (conta_id, funil_id, etapa_id, titulo, criada_por, responsavel_id)
  values (v_conta, 'prospeccao',
          (select id from crm_etapas where funil_id = 'prospeccao' and ordem = 1),
          'Primeiro pedido', 'pessoa', auth.uid());
  return v_conta;
end $$;

grant execute on function crm_falei_com_ele(uuid), crm_desfazer_contato(uuid),
                          crm_mover_etapa(uuid, uuid, text), crm_rodar(text),
                          crm_hoje(), crm_dias_escada(integer), crm_exigir_papel(text[]),
                          crm_criar_prospect(text, text, text, text, text)
  to authenticated;
