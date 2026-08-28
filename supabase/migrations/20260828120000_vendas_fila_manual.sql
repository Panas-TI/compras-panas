-- Cliente puxado à mão para o atendimento do dia.
--
-- A lista de hoje é montada por regra: ciclo vencido, retorno combinado, cota
-- de reativação. Quem decide falar com alguém por um motivo que o sistema não
-- conhece — pedido do dono, cliente que ligou, campanha — não tinha como
-- colocar esse cliente na frente do vendedor.
create table vendas_fila_manual (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references vendas_clientes(id) on delete cascade,
  data date not null default current_date,
  motivo text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Puxar duas vezes no mesmo dia é a mesma intenção, não duas.
create unique index vendas_fila_manual_unica on vendas_fila_manual (cliente_id, data);
create index vendas_fila_manual_dia on vendas_fila_manual (data);

alter table vendas_fila_manual enable row level security;

create policy vendas_fila_manual_sel on vendas_fila_manual for select
  using (tem_papel_vendas(array['aprovador','vendas','comprador']));
create policy vendas_fila_manual_ins on vendas_fila_manual for insert
  with check (tem_papel_vendas(array['aprovador','vendas']));
create policy vendas_fila_manual_del on vendas_fila_manual for delete
  using (tem_papel_vendas(array['aprovador','vendas']));
