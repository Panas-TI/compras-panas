-- CRM · 0001 · Empresas, membros e objetos centrais
--
-- Várias empresas no mesmo banco. Toda linha carrega org_id, e as chaves
-- estrangeiras são compostas (id, org_id): uma oportunidade não consegue
-- apontar para a conta de outra empresa nem por erro de código. O isolamento
-- não depende só da RLS — o próprio formato das tabelas impede a mistura.

create extension if not exists pgcrypto;

-- Função nova nasce fechada. Global, não "in schema": o EXECUTE de PUBLIC é um
-- padrão global do Postgres e regra por esquema não o remove (ver 0004).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

create table organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(trim(name)) > 0),
  slug                 text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  timezone             text not null default 'America/Sao_Paulo',
  currency             char(3) not null default 'BRL',
  locale               text not null default 'pt-BR',
  -- Regras do motor, ajustáveis por empresa.
  followup_days        smallint[] not null default '{2,4,8}',
  max_attempts         smallint not null default 4 check (max_attempts between 1 and 10),
  repurchase_lead_days smallint not null default 3 check (repurchase_lead_days between 0 and 30),
  reactivation_quota   smallint not null default 15 check (reactivation_quota between 0 and 500),
  created_at           timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','sales','viewer')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user on memberships (user_id) where active;

create function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                  where m.org_id = p_org and m.user_id = auth.uid() and m.active);
$$;

create function has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                  where m.org_id = p_org and m.user_id = auth.uid() and m.active
                    and m.role = any(p_roles));
$$;

-- Ação que muda dado exige papel. Sem sessão (rotina do banco) auth.uid() é
-- nulo e passa; o anônimo nunca chega aqui porque não tem EXECUTE.
create function require_role(p_org uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not has_role(p_org, p_roles) then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

create function local_today(p_org uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone o.timezone)::date from organizations o where o.id = p_org;
$$;

create function no_duplicates(p smallint[]) returns boolean
language sql immutable set search_path = public as $$
  select cardinality(p) = (select count(distinct x) from unnest(p) x);
$$;

grant execute on function is_member(uuid), has_role(uuid, text[]), require_role(uuid, text[]),
                          local_today(uuid), no_duplicates(smallint[]) to authenticated;

create table accounts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  legal_name   text,
  tax_id       text,
  segment      text,
  lifecycle    text not null default 'customer' check (lifecycle in ('lead','customer','closed')),
  source       text,
  region       text,
  address      text,
  city         text,
  state        text,
  postal_code  text,
  parent_id    uuid,
  owner_id     uuid references auth.users(id) on delete set null,
  contact_days smallint[] check (contact_days is null or (
                 cardinality(contact_days) between 1 and 7
                 and contact_days <@ array[1,2,3,4,5,6,7]::smallint[]
                 and no_duplicates(contact_days))),
  custom       jsonb not null default '{}'::jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, tax_id),
  foreign key (parent_id, org_id) references accounts (id, org_id),
  check (parent_id is distinct from id)
);
create index accounts_org_name on accounts (org_id, lower(name));

create table contacts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  account_id       uuid not null,
  name             text,
  role             text,
  phone_e164       text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_unverified boolean not null default false,
  whatsapp         boolean not null default true,
  email            text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_primary       boolean not null default false,
  custom           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade
);
create unique index contacts_one_primary on contacts (account_id) where is_primary;
-- Um telefone, uma pessoa, dentro da mesma empresa: duplicado é barrado pelo banco.
create unique index contacts_phone_per_org on contacts (org_id, phone_e164) where phone_e164 is not null;

create table products (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  sku        text,
  active     boolean not null default true,
  unique (id, org_id),
  unique (org_id, sku)
);

create table orders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  account_id  uuid not null,
  external_id text,
  ordered_at  date not null,
  total       numeric(14,2) not null check (total >= 0),
  status      text not null default 'valid' check (status in ('valid','cancelled','courtesy')),
  source      text not null default 'import' check (source in ('import','api','manual')),
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, external_id),
  foreign key (account_id, org_id) references accounts (id, org_id)
);
create index orders_account_date on orders (account_id, ordered_at) where status = 'valid';

create table order_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  order_id     uuid not null,
  product_id   uuid,
  product_name text not null,
  quantity     numeric(12,3) not null default 1,
  amount       numeric(14,2) not null default 0,
  foreign key (order_id, org_id) references orders (id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products (id, org_id)
);

-- Como a conta aparece num sistema externo (ERP, planilha). Chave da importação.
create table account_aliases (
  org_id        uuid not null references organizations(id) on delete cascade,
  source        text not null,
  external_name text not null,
  account_id    uuid not null,
  verified      boolean not null default false,
  primary key (org_id, source, external_name),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade
);

create table pipelines (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  name     text not null,
  kind     text not null check (kind in ('manual','repurchase','reactivation')),
  position smallint not null default 0,
  active   boolean not null default true,
  unique (id, org_id),
  unique (org_id, name)
);
-- Cada empresa tem no máximo um funil automático de cada tipo.
create unique index pipelines_one_auto on pipelines (org_id, kind) where kind <> 'manual';

create table stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  pipeline_id uuid not null,
  name        text not null,
  position    smallint not null,
  outcome     text not null check (outcome in ('open','won','lost')),
  probability numeric(5,2) not null default 0 check (probability between 0 and 100),
  rot_days    smallint check (rot_days > 0),
  guidance    text,
  unique (pipeline_id, position),
  unique (id, pipeline_id),
  foreign key (pipeline_id, org_id) references pipelines (id, org_id) on delete cascade
);

create table deals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  account_id       uuid not null,
  pipeline_id      uuid not null,
  stage_id         uuid not null,
  title            text not null,
  amount           numeric(14,2) not null default 0 check (amount >= 0),
  created_by_kind  text not null check (created_by_kind in ('user','system')),
  cycle_ref        date,
  opened_at        timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  closed_at        timestamptz,
  lost_reason      text,
  won_order_id     uuid,
  snoozed_until    date,
  owner_id         uuid references auth.users(id) on delete set null,
  custom           jsonb not null default '{}'::jsonb,
  unique (id, org_id),
  foreign key (account_id, org_id)  references accounts (id, org_id),
  foreign key (pipeline_id, org_id) references pipelines (id, org_id),
  foreign key (stage_id, pipeline_id) references stages (id, pipeline_id),
  foreign key (won_order_id, org_id) references orders (id, org_id)
);
create unique index deals_one_open on deals (account_id, pipeline_id) where closed_at is null;
create unique index deals_one_cycle on deals (account_id, pipeline_id, cycle_ref) where cycle_ref is not null;
create index deals_board on deals (pipeline_id, stage_id) where closed_at is null;

create table deal_stage_history (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  deal_id    uuid not null,
  from_stage uuid,
  to_stage   uuid not null,
  at         timestamptz not null default now(),
  by_user    uuid,
  reason     text,
  foreign key (deal_id, org_id) references deals (id, org_id) on delete cascade
);
create index deal_history_deal on deal_stage_history (deal_id, at);

create table activities (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  account_id uuid not null,
  deal_id    uuid,
  contact_id uuid,
  type       text not null default 'whatsapp'
             check (type in ('whatsapp','call','email','meeting','visit','sample','task')),
  status     text not null check (status in ('scheduled','done','cancelled')),
  due_date   date,
  due_time   time,
  done_at    timestamptz,
  outcome    text check (outcome in ('no_answer','interested','will_buy','bought','not_now','refused')),
  notes      text,
  -- 'user' = combinado com o cliente · 'system' = lembrete automático. Nunca se confundem na tela.
  source     text not null check (source in ('user','system')),
  attempt    smallint check (attempt between 1 and 20),
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade,
  foreign key (deal_id, org_id)    references deals (id, org_id),
  foreign key (contact_id, org_id) references contacts (id, org_id),
  check (status <> 'done'      or done_at is not null),
  check (status <> 'scheduled' or due_date is not null)
);
create index activities_agenda  on activities (org_id, due_date) where status = 'scheduled';
create index activities_account on activities (account_id, created_at desc);
create index activities_deal    on activities (deal_id) where status = 'done';

create table notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  account_id uuid not null,
  body       text not null check (length(trim(body)) between 1 and 5000),
  pinned     boolean not null default false,
  author_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade
);
create unique index notes_one_pinned on notes (account_id) where pinned;

create table account_metrics (
  account_id        uuid primary key,
  org_id            uuid not null,
  first_order_at    date,
  last_order_at     date,
  orders_count      integer not null default 0,
  revenue           numeric(16,2) not null default 0,
  avg_ticket        numeric(14,2),
  cycle_days        smallint,
  expected_at       date,
  status            text not null default 'no_pattern'
                    check (status in ('active','late','inactive','no_pattern')),
  annual_at_risk    numeric(16,2),
  computed_at       timestamptz not null default now(),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade
);

create table account_status_daily (
  day        date not null,
  account_id uuid not null,
  org_id     uuid not null,
  status     text not null,
  primary key (day, account_id),
  foreign key (account_id, org_id) references accounts (id, org_id) on delete cascade
);

create table goals (
  org_id       uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  kind         text not null check (kind in ('revenue','coverage')),
  target       numeric(16,2) not null check (target > 0),
  primary key (org_id, period_start, kind)
);

create table custom_fields (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  entity   text not null check (entity in ('account','contact','deal')),
  key      text not null check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label    text not null,
  type     text not null check (type in ('text','number','date','select','boolean')),
  options  jsonb,
  position smallint not null default 0,
  unique (org_id, entity, key)
);

create table automation_runs (
  id          bigint generated always as identity primary key,
  org_id      uuid references organizations(id) on delete cascade,
  routine     text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','ok','error')),
  rows        integer,
  error       text
);

-- ------------------------------------------------------------------ RLS
alter table organizations enable row level security;
create policy organizations_read  on organizations for select to authenticated using (is_member(id));
create policy organizations_admin on organizations for update to authenticated
  using (has_role(id, array['owner','admin'])) with check (has_role(id, array['owner','admin']));

alter table memberships enable row level security;
create policy memberships_read  on memberships for select to authenticated using (is_member(org_id));
create policy memberships_admin on memberships for all to authenticated
  using (has_role(org_id, array['owner','admin'])) with check (has_role(org_id, array['owner','admin']));

do $$
declare t text;
begin
  foreach t in array array['accounts','contacts','products','orders','order_items','account_aliases',
                           'pipelines','stages','deals','deal_stage_history','activities','notes',
                           'account_metrics','account_status_daily','goals','custom_fields','automation_runs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (is_member(org_id))', t || '_read', t);
  end loop;
  foreach t in array array['accounts','contacts','orders','order_items','account_aliases','deals','activities','notes','products']
  loop
    execute format('create policy %I on %I for all to authenticated
                      using (has_role(org_id, array[''owner'',''admin'',''sales'']))
                      with check (has_role(org_id, array[''owner'',''admin'',''sales'']))', t || '_write', t);
  end loop;
  foreach t in array array['pipelines','stages','goals','custom_fields']
  loop
    execute format('create policy %I on %I for all to authenticated
                      using (has_role(org_id, array[''owner'',''admin'']))
                      with check (has_role(org_id, array[''owner'',''admin'']))', t || '_admin', t);
  end loop;
end $$;
