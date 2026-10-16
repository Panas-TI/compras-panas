-- Cenário com duas empresas de demonstração. Rodar dentro de begin; … rollback;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'dono-a@demo.test'),
  ('00000000-0000-4000-8000-00000000000b', 'dono-b@demo.test'),
  ('00000000-0000-4000-8000-00000000000c', 'leitor-a@demo.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('t.org_a', create_organization('Distribuidora Demo A', 'demo-a')::text, true);

-- 40 clientes que compram a cada 7 dias: 1–10 pararam há 2 meses, 11–25 vencem
-- amanhã (última compra há 6 dias), 26–40 compraram anteontem.
insert into accounts (org_id, name, lifecycle, custom)
select current_setting('t.org_a')::uuid, 'Cliente ' || g, 'customer', jsonb_build_object('g', g)
  from generate_series(1, 40) g;
insert into orders (org_id, account_id, external_id, ordered_at, total)
select a.org_id, a.id, a.name || '-' || k,
       current_date - (k * 7) - case when (a.custom->>'g')::int <= 10 then 60
                                     when (a.custom->>'g')::int <= 25 then 6 else 2 end,
       300 + (k % 3) * 50
  from accounts a cross join generate_series(0, 9) k
 where a.org_id = current_setting('t.org_a')::uuid;

select run_routine(current_setting('t.org_a')::uuid, 'metrics');
select run_routine(current_setting('t.org_a')::uuid, 'repurchase');
select run_routine(current_setting('t.org_a')::uuid, 'reactivation');

select set_config('t.acc', (select d.account_id::text from deals d join pipelines p on p.id = d.pipeline_id
   where p.kind = 'repurchase' and d.closed_at is null limit 1), true);
select set_config('t.c1', log_contact(current_setting('t.acc')::uuid)::text, true);
select set_config('t.etapa1', (select s.name from deals d join stages s on s.id = d.stage_id join pipelines p on p.id = d.pipeline_id
   where d.account_id = current_setting('t.acc')::uuid and p.kind = 'repurchase'), true);
select set_config('t.lembrete', (select (due_date - local_today(org_id))::text from activities
   where account_id = current_setting('t.acc')::uuid and source = 'system' and status = 'scheduled'), true);
select set_config('t.c2', log_contact(current_setting('t.acc')::uuid)::text, true);
select undo_contact(current_setting('t.c1')::uuid);
select set_config('t.desfeito', (select s.name from deals d join stages s on s.id = d.stage_id join pipelines p on p.id = d.pipeline_id
   where d.account_id = current_setting('t.acc')::uuid and p.kind = 'repurchase'), true);

select set_config('t.lead', create_lead(current_setting('t.org_a')::uuid, 'Café Novo', '51 98888-0001', 'cafeteria', 'indicação')::text, true);
select log_contact(current_setting('t.lead')::uuid);
select set_config('t.lead_etapa', (select s.name from deals d join stages s on s.id = d.stage_id where d.account_id = current_setting('t.lead')::uuid), true);
do $$ begin
  perform create_lead(current_setting('t.org_a')::uuid, 'Outro', '(51) 98888-0001');
  perform set_config('t.dup', 'duplicou', true);
exception when others then perform set_config('t.dup', 'barrado: ' || sqlerrm, true); end $$;

-- o lead compra pela primeira vez: vira cliente e a venda fecha sozinha
insert into orders (org_id, account_id, external_id, ordered_at, total)
values (current_setting('t.org_a')::uuid, current_setting('t.lead')::uuid, 'lead-1', current_date, 450);
select run_routine(current_setting('t.org_a')::uuid, 'orders');
select set_config('t.lead_depois', (select a.lifecycle || ' · ' || s.name from accounts a join deals d on d.account_id = a.id
   join stages s on s.id = d.stage_id where a.id = current_setting('t.lead')::uuid), true);

insert into memberships (org_id, user_id, role)
values (current_setting('t.org_a')::uuid, '00000000-0000-4000-8000-00000000000c', 'viewer');

-- empresa B: outro dono, não pode ver nem mexer em nada da A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('t.org_b', create_organization('Loja Demo B', 'demo-b')::text, true);
select set_config('t.b_ve_contas_a', (select count(*)::text from accounts where org_id = current_setting('t.org_a')::uuid), true);
do $$ begin
  perform log_contact(current_setting('t.acc')::uuid);
  perform set_config('t.b_registra', 'CONSEGUIU', true);
exception when others then perform set_config('t.b_registra', 'barrado: ' || sqlerrm, true); end $$;

-- leitor da A: vê, não escreve
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select set_config('t.leitor_ve', (select count(*)::text from accounts where org_id = current_setting('t.org_a')::uuid), true);
do $$ begin
  perform log_contact(current_setting('t.acc')::uuid);
  perform set_config('t.leitor_registra', 'CONSEGUIU', true);
exception when others then perform set_config('t.leitor_registra', 'barrado: ' || sqlerrm, true); end $$;

reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  insert into orders (org_id, account_id, ordered_at, total)
  values (current_setting('t.org_b')::uuid, current_setting('t.acc')::uuid, current_date, 10);
  perform set_config('t.cruzado', 'GRAVOU', true);
exception when others then perform set_config('t.cruzado', 'barrado pelo banco: ' || sqlerrm, true); end $$;

select json_build_object(
  'situacao', (select json_object_agg(status, n) from (select status, count(*) n from account_metrics group by 1) x),
  'oportunidades', (select json_object_agg(p.name || ' · ' || s.name, n) from (select pipeline_id, stage_id, count(*) n from deals group by 1,2) d
                     join pipelines p on p.id = d.pipeline_id join stages s on s.id = d.stage_id),
  'rotinas', (select json_agg(routine || ':' || status) from automation_runs),
  'clique_vai_para', current_setting('t.etapa1'),
  'lembrete_em_dias', current_setting('t.lembrete'),
  'clique_repetido_mesmo', current_setting('t.c1') = current_setting('t.c2'),
  'desfazer_volta_para', current_setting('t.desfeito'),
  'lead_apos_contato', current_setting('t.lead_etapa'),
  'telefone_repetido', current_setting('t.dup'),
  'lead_apos_1a_compra', current_setting('t.lead_depois'),
  'empresa_b_ve_contas_da_a', current_setting('t.b_ve_contas_a'),
  'empresa_b_registra_na_a', current_setting('t.b_registra'),
  'leitor_ve_contas', current_setting('t.leitor_ve'),
  'leitor_registra', current_setting('t.leitor_registra'),
  'pedido_cruzando_empresas', current_setting('t.cruzado'),
  'quadro_linhas', (select count(*) from pipeline_board),
  'previsao', (select json_object_agg(kind, round(expected)) from forecast_open)
) resultado;
