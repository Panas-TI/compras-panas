-- CRM · 0002 · Motor
-- O diferencial do produto: a oportunidade de recompra nasce sozinha a partir
-- do histórico de compras de cada cliente e fecha sozinha quando o pedido chega.
-- Quem vende registra só "falei com ele" e o que o cliente combinou.

alter table organizations add column phone_country text not null default '55' check (phone_country ~ '^[1-9][0-9]{0,2}$');

-- n-ésima etapa aberta de um funil, pela posição. Se o funil tiver menos, a última aberta.
create function nth_open_stage(p_pipeline uuid, p_n integer) returns uuid
language sql stable security definer set search_path = public as $$
  select id from (
    select id, row_number() over (order by position) rn, count(*) over () total
      from stages where pipeline_id = p_pipeline and outcome = 'open'
  ) s where rn = least(greatest(p_n, 1), total);
$$;

create function outcome_stage(p_pipeline uuid, p_outcome text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from stages where pipeline_id = p_pipeline and outcome = p_outcome order by position limit 1;
$$;

create function followup_days(p_org uuid, p_attempt integer) returns integer
language sql stable security definer set search_path = public as $$
  select f[least(greatest(p_attempt, 1), cardinality(f))]
    from (select followup_days f from organizations where id = p_org) o;
$$;

-- Empresa nova: quem cria vira dono, e os três funis já vêm prontos.
create function create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_p   uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para criar uma empresa.'; end if;
  insert into organizations (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');

  insert into pipelines (org_id, name, kind, position) values (v_org, 'Vendas', 'manual', 1) returning id into v_p;
  insert into stages (org_id, pipeline_id, name, position, outcome, probability, rot_days, guidance) values
    (v_org, v_p, 'Novo',        1, 'open', 10, 7,  'Apresente-se e entenda o que o cliente precisa.'),
    (v_org, v_p, 'Qualificado', 2, 'open', 25, 10, 'Confirme quem decide e quando pretende comprar.'),
    (v_org, v_p, 'Proposta',    3, 'open', 50, 7,  'Envie a proposta e combine a data da resposta.'),
    (v_org, v_p, 'Negociação',  4, 'open', 70, 7,  'Resolva a última objeção antes de dar desconto.'),
    (v_org, v_p, 'Ganho',       5, 'won', 100, null, null),
    (v_org, v_p, 'Perdido',     6, 'lost',  0, null, null);

  insert into pipelines (org_id, name, kind, position) values (v_org, 'Recompra', 'repurchase', 2) returning id into v_p;
  insert into stages (org_id, pipeline_id, name, position, outcome, probability, guidance) values
    (v_org, v_p, 'Prevista',     1, 'open', 55, 'Ofereça a compra de sempre.'),
    (v_org, v_p, 'Contatada',    2, 'open', 60, 'O cliente já recebeu a mensagem. Não repita o mesmo texto.'),
    (v_org, v_p, 'Acompanhando', 3, 'open', 35, 'Mude o argumento: o item que ele parou de levar.'),
    (v_org, v_p, 'Comprou',      4, 'won', 100, null),
    (v_org, v_p, 'Sem compra',   5, 'lost',  0, null);

  insert into pipelines (org_id, name, kind, position) values (v_org, 'Reativação', 'reactivation', 3) returning id into v_p;
  insert into stages (org_id, pipeline_id, name, position, outcome, probability, guidance) values
    (v_org, v_p, 'Na fila',      1, 'open', 10, 'Pergunte o que mudou antes de oferecer.'),
    (v_org, v_p, 'Contatada',    2, 'open', 20, 'Ofereça o item que ele mais comprava.'),
    (v_org, v_p, 'Acompanhando', 3, 'open', 15, 'Última tentativa: uma condição para voltar.'),
    (v_org, v_p, 'Recuperado',   4, 'won', 100, null),
    (v_org, v_p, 'Descartado',   5, 'lost',  0, null);
  return v_org;
end $$;

-- Único caminho de mudança de etapa; grava o histórico.
create function move_deal(p_deal uuid, p_stage uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_d deals;
  v_s stages;
begin
  select * into v_d from deals where id = p_deal for update;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  perform require_role(v_d.org_id, array['owner','admin','sales']);
  select * into v_s from stages where id = p_stage;
  if not found or v_s.pipeline_id <> v_d.pipeline_id then
    raise exception 'Essa etapa não é do funil desta oportunidade.';
  end if;
  if v_d.stage_id = p_stage then return; end if;
  update deals set stage_id = p_stage, stage_entered_at = now(),
         closed_at   = case when v_s.outcome = 'open' then null else now() end,
         lost_reason = case when v_s.outcome = 'lost' then coalesce(p_reason, lost_reason) end
   where id = p_deal;
  insert into deal_stage_history (org_id, deal_id, from_stage, to_stage, by_user, reason)
  values (v_d.org_id, p_deal, v_d.stage_id, p_stage, auth.uid(), p_reason);
end $$;

-- "Falei com ele." Um clique; etapa, lembrete e tentativa são do sistema.
create function log_contact(p_account uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_org     uuid;
  v_today   date;
  v_act     uuid;
  v_d       deals;
  v_kind    text;
  v_attempt integer;
  v_pos     integer;
  v_max     integer;
begin
  select org_id into v_org from accounts where id = p_account;
  if v_org is null then raise exception 'Conta não encontrada.'; end if;
  v_today := local_today(v_org);

  -- Clicar duas vezes no mesmo dia não vale duas tentativas.
  select id into v_act from activities
   where account_id = p_account and status = 'done' and source = 'user'
     and (done_at at time zone (select timezone from organizations where id = v_org))::date = v_today
   limit 1;
  if found then return v_act; end if;

  -- A mais urgente: recompra, depois venda, depois reativação.
  select d.* into v_d
    from deals d join pipelines p on p.id = d.pipeline_id
   where d.account_id = p_account and d.closed_at is null
   order by case p.kind when 'repurchase' then 1 when 'manual' then 2 else 3 end, d.opened_at
   limit 1;
  select kind into v_kind from pipelines where id = v_d.pipeline_id;

  update activities set status = 'cancelled'
   where account_id = p_account and status = 'scheduled' and source = 'system';

  insert into activities (org_id, account_id, deal_id, type, status, done_at, source, user_id)
  values (v_org, p_account, v_d.id, 'whatsapp', 'done', now(), 'user', auth.uid())
  returning id into v_act;

  if v_d.id is null then return v_act; end if;

  select count(*) into v_attempt from activities where deal_id = v_d.id and status = 'done';
  select max_attempts into v_max from organizations where id = v_org;

  if v_kind <> 'manual' and v_attempt >= v_max then
    perform move_deal(v_d.id, outcome_stage(v_d.pipeline_id, 'lost'),
                      'Sem compra depois de ' || v_max || ' tentativas');
    return v_act;
  end if;

  if v_kind <> 'manual' then
    perform move_deal(v_d.id, nth_open_stage(v_d.pipeline_id, case when v_attempt = 1 then 2 else 3 end));
  else
    select count(*) into v_pos from stages s
     where s.pipeline_id = v_d.pipeline_id and s.outcome = 'open'
       and s.position <= (select position from stages where id = v_d.stage_id);
    if v_pos = 1 then perform move_deal(v_d.id, nth_open_stage(v_d.pipeline_id, 2)); end if;
  end if;

  insert into activities (org_id, account_id, deal_id, type, status, due_date, source, attempt)
  values (v_org, p_account, v_d.id, 'whatsapp', 'scheduled',
          v_today + followup_days(v_org, v_attempt), 'system', v_attempt + 1);
  return v_act;
end $$;

create function undo_contact(p_activity uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_a activities;
  v_h deal_stage_history;
begin
  select * into v_a from activities where id = p_activity;
  if not found or v_a.source <> 'user' or v_a.status <> 'done'
     or (v_a.done_at at time zone (select timezone from organizations where id = v_a.org_id))::date
        <> local_today(v_a.org_id) then
    raise exception 'Só dá para desfazer o contato de hoje.';
  end if;
  delete from activities where account_id = v_a.account_id and source = 'system'
     and status = 'scheduled' and created_at >= v_a.created_at;
  if v_a.deal_id is not null then
    select * into v_h from deal_stage_history
     where deal_id = v_a.deal_id and at >= v_a.created_at order by at limit 1;
    if found and v_h.from_stage is not null then
      perform move_deal(v_a.deal_id, v_h.from_stage, 'Contato desfeito');
    end if;
  end if;
  delete from activities where id = p_activity;
end $$;

-- Lead novo num passo. Telefone repetido na mesma empresa é barrado.
create function create_lead(p_org uuid, p_name text, p_phone text,
                            p_segment text default null, p_source text default null,
                            p_region text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_cc     text;
  v_phone  text;
  v_acc    uuid;
  v_owner  text;
  v_pipe   uuid;
begin
  select phone_country into v_cc from organizations where id = p_org;
  v_phone := case
               when trim(p_phone) like '+%' then '+' || v_digits
               when v_cc = '55' and length(v_digits) in (10, 11) then '+55' || v_digits
               when v_digits like v_cc || '%' and length(v_digits) >= 10 then '+' || v_digits
             end;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Informe o telefone com DDD.';
  end if;
  select a.name into v_owner from contacts c join accounts a on a.id = c.account_id
   where c.org_id = p_org and c.phone_e164 = v_phone;
  if found then raise exception 'Esse telefone já está cadastrado em %.', v_owner; end if;

  insert into accounts (org_id, name, segment, source, region, lifecycle, owner_id)
  values (p_org, trim(p_name), p_segment, p_source, p_region, 'lead', auth.uid())
  returning id into v_acc;
  insert into contacts (org_id, account_id, phone_e164, is_primary) values (p_org, v_acc, v_phone, true);
  select id into v_pipe from pipelines where org_id = p_org and kind = 'manual' and active
   order by position limit 1;
  if v_pipe is not null then
    insert into deals (org_id, account_id, pipeline_id, stage_id, title, created_by_kind, owner_id)
    values (p_org, v_acc, v_pipe, nth_open_stage(v_pipe, 1), 'Primeira compra', 'user', auth.uid());
  end if;
  return v_acc;
end $$;

-- Números de cada conta a partir das compras válidas.
create function recalc_metrics(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n       integer;
  v_today date := local_today(p_org);
begin
  perform require_role(p_org, array['owner','admin','sales']);
  with o as (
    select account_id, ordered_at, total from orders where org_id = p_org and status = 'valid'
  ), base as (
    select account_id, count(*) cnt, sum(total) rev, min(ordered_at) first_at, max(ordered_at) last_at
      from o group by account_id
  ), gaps as (
    select account_id, ordered_at, ordered_at - lag(ordered_at) over (partition by account_id order by ordered_at) gap from o
  ), recent as (  -- só os 8 intervalos mais recentes: cliente antigo não carrega sumiço antigo
    select account_id, gap, row_number() over (partition by account_id order by ordered_at desc) rn
      from gaps where gap is not null
  ), cyc as (
    select account_id, percentile_cont(0.5) within group (order by gap)::int days from recent where rn <= 8 group by account_id
  ), calc as (
    select b.*, case when b.cnt >= 3 then c.days
                     when b.cnt = 2 and (b.last_at - b.first_at) between 1 and 45 then b.last_at - b.first_at end cycle,
           v_today - b.last_at recency
      from base b left join cyc c using (account_id)
  )
  insert into account_metrics as m (account_id, org_id, first_order_at, last_order_at, orders_count, revenue,
                                    avg_ticket, cycle_days, expected_at, status, annual_at_risk, computed_at)
  select k.account_id, p_org, k.first_at, k.last_at, k.cnt, k.rev, round(k.rev / k.cnt, 2), k.cycle,
         k.last_at + k.cycle,
         case when k.cycle is null then 'no_pattern'
              when k.recency > 30 and k.recency > 2 * k.cycle then 'inactive'
              when k.recency > k.cycle then 'late'
              else 'active' end,
         case when k.cycle > 0 then round(k.rev / k.cnt * 365.0 / k.cycle, 2) end,
         now()
    from calc k
  on conflict (account_id) do update set
    first_order_at = excluded.first_order_at, last_order_at = excluded.last_order_at,
    orders_count = excluded.orders_count, revenue = excluded.revenue, avg_ticket = excluded.avg_ticket,
    cycle_days = excluded.cycle_days, expected_at = excluded.expected_at, status = excluded.status,
    annual_at_risk = excluded.annual_at_risk, computed_at = excluded.computed_at;
  get diagnostics n = row_count;
  return n;
end $$;

create function generate_repurchase(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n      integer;
  v_pipe uuid;
  v_lead smallint;
begin
  perform require_role(p_org, array['owner','admin','sales']);
  select id into v_pipe from pipelines where org_id = p_org and kind = 'repurchase' and active;
  if v_pipe is null then return 0; end if;
  select repurchase_lead_days into v_lead from organizations where id = p_org;
  insert into deals (org_id, account_id, pipeline_id, stage_id, title, amount, created_by_kind, cycle_ref)
  select p_org, a.id, v_pipe, nth_open_stage(v_pipe, 1),
         'Recompra · prevista ' || to_char(m.expected_at, 'DD/MM'), coalesce(m.avg_ticket, 0), 'system', m.expected_at
    from accounts a join account_metrics m on m.account_id = a.id
   where a.org_id = p_org and a.active and a.lifecycle = 'customer'
     and m.status in ('active','late')
     and m.expected_at <= local_today(p_org) + v_lead
     and not exists (select 1 from deals d where d.account_id = a.id and d.pipeline_id = v_pipe and d.closed_at is null)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create function generate_reactivation(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n      integer;
  v_pipe uuid;
  v_room integer;
begin
  perform require_role(p_org, array['owner','admin','sales']);
  select id into v_pipe from pipelines where org_id = p_org and kind = 'reactivation' and active;
  if v_pipe is null then return 0; end if;
  select greatest(o.reactivation_quota - (select count(*) from deals where pipeline_id = v_pipe and closed_at is null), 0)
    into v_room from organizations o where o.id = p_org;
  insert into deals (org_id, account_id, pipeline_id, stage_id, title, amount, created_by_kind)
  select p_org, a.id, v_pipe, nth_open_stage(v_pipe, 1), 'Reativação', coalesce(m.avg_ticket, 0), 'system'
    from accounts a join account_metrics m on m.account_id = a.id
   where a.org_id = p_org and a.active and a.lifecycle = 'customer' and m.status = 'inactive'
     and not exists (select 1 from deals d where d.account_id = a.id and d.closed_at is null)
     and not exists (select 1 from deals d where d.account_id = a.id and d.pipeline_id = v_pipe
                       and d.closed_at > now() - interval '60 days')
   order by m.annual_at_risk desc nulls last
   limit v_room
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- A compra fecha a oportunidade. Ninguém precisa marcar "ganha".
-- Funil manual só fecha sozinho para lead (primeira compra); venda adicional
-- para cliente continua decisão de quem vende.
create function close_by_orders(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  perform require_role(p_org, array['owner','admin','sales']);
  for r in
    select d.id deal_id, d.pipeline_id, d.account_id, o.id order_id, p.kind, a.lifecycle
      from deals d
      join pipelines p on p.id = d.pipeline_id
      join accounts a on a.id = d.account_id
      join lateral (select x.id from orders x
                     where x.account_id = d.account_id and x.status = 'valid'
                       and x.ordered_at >= (d.opened_at at time zone (select timezone from organizations where id = p_org))::date
                     order by x.ordered_at limit 1) o on true
     where d.org_id = p_org and d.closed_at is null
       and (p.kind <> 'manual' or a.lifecycle = 'lead')
  loop
    perform move_deal(r.deal_id, outcome_stage(r.pipeline_id, 'won'), null);
    update deals set won_order_id = r.order_id where id = r.deal_id;
    update activities set status = 'cancelled'
     where account_id = r.account_id and status = 'scheduled' and source = 'system';
    if r.lifecycle = 'lead' then
      update accounts set lifecycle = 'customer', updated_at = now() where id = r.account_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create function snapshot_status(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform require_role(p_org, array['owner','admin','sales']);
  insert into account_status_daily (day, account_id, org_id, status)
  select local_today(p_org), account_id, p_org, status from account_metrics where org_id = p_org
  on conflict (day, account_id) do update set status = excluded.status;
  get diagnostics n = row_count;
  return n;
end $$;

create function run_routine(p_org uuid, p_routine text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_n  integer;
begin
  perform require_role(p_org, array['owner','admin','sales']);
  insert into automation_runs (org_id, routine) values (p_org, p_routine) returning id into v_id;
  begin
    case p_routine
      when 'metrics'      then v_n := recalc_metrics(p_org);
      when 'snapshot'     then v_n := snapshot_status(p_org);
      when 'orders'       then v_n := close_by_orders(p_org);
      when 'repurchase'   then v_n := generate_repurchase(p_org);
      when 'reactivation' then v_n := generate_reactivation(p_org);
      else raise exception 'Rotina desconhecida: %', p_routine;
    end case;
    update automation_runs set finished_at = now(), status = 'ok', rows = v_n where id = v_id;
  exception when others then
    update automation_runs set finished_at = now(), status = 'error', error = sqlerrm where id = v_id;
  end;
end $$;

-- Rotina noturna de todas as empresas. Só o banco chama; ninguém tem EXECUTE.
create function run_nightly() returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select id from organizations loop
    perform run_routine(o.id, 'metrics');
    perform run_routine(o.id, 'snapshot');
    perform run_routine(o.id, 'orders');
    perform run_routine(o.id, 'repurchase');
    perform run_routine(o.id, 'reactivation');
  end loop;
end $$;
revoke execute on function run_nightly() from authenticated;

grant execute on function create_organization(text, text), move_deal(uuid, uuid, text),
  log_contact(uuid), undo_contact(uuid), create_lead(uuid, text, text, text, text, text),
  run_routine(uuid, text), nth_open_stage(uuid, integer), outcome_stage(uuid, text),
  followup_days(uuid, integer)
  to authenticated;
