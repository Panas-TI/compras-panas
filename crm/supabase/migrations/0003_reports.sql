-- CRM · 0003 · Relatórios
-- Somados no banco; a tela lê poucas linhas. security_invoker: cada empresa só soma o que é dela.

create view pipeline_board with (security_invoker = true) as
select s.org_id, s.pipeline_id, s.id stage_id, s.name stage, s.position, s.outcome, s.probability,
       count(d.id)::int deals, coalesce(sum(d.amount), 0) amount,
       coalesce(sum(d.amount * s.probability / 100), 0) weighted
  from stages s
  left join deals d on d.stage_id = s.id and (d.closed_at is null or d.closed_at >= date_trunc('week', now()))
 group by s.org_id, s.pipeline_id, s.id, s.name, s.position, s.outcome, s.probability;

-- "Comprou sem contato" é o grupo de comparação: separa o efeito do contato
-- de quem ia comprar de qualquer jeito.
create view repurchase_conversion with (security_invoker = true) as
with d as (
  select d.org_id, date_trunc('week', d.opened_at)::date week, s.outcome,
         exists (select 1 from activities a where a.deal_id = d.id and a.status = 'done') contacted
    from deals d join pipelines p on p.id = d.pipeline_id and p.kind = 'repurchase'
    join stages s on s.id = d.stage_id
)
select org_id, week, count(*)::int expected,
       count(*) filter (where contacted)::int contacted,
       count(*) filter (where outcome = 'won' and contacted)::int bought_after_contact,
       count(*) filter (where outcome = 'won' and not contacted)::int bought_without_contact,
       count(*) filter (where outcome = 'lost')::int no_purchase
  from d group by org_id, week;

create view weekly_scoreboard with (security_invoker = true) as
with w as (
  select org_id, date_trunc('week', ordered_at)::date week,
         sum(total) revenue, count(*)::int orders, count(distinct account_id)::int buying_accounts
    from orders where status = 'valid'
   group by org_id, date_trunc('week', ordered_at)::date
)
select w.*, g.target goal
  from w left join goals g on g.org_id = w.org_id and g.kind = 'revenue' and g.period_start = w.week;

create view forecast_open with (security_invoker = true) as
select d.org_id, p.kind, count(*)::int deals, sum(d.amount) amount,
       sum(d.amount * s.probability / 100) expected
  from deals d join pipelines p on p.id = d.pipeline_id join stages s on s.id = d.stage_id
 where d.closed_at is null
 group by d.org_id, p.kind;
