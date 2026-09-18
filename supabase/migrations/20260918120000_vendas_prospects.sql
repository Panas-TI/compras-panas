-- Prospecção: quem ainda NÃO é cliente.
--
-- Até aqui o módulo Vendas só sabia trabalhar a carteira: fila do dia por
-- ciclo de recompra, reativação de quem parou, itens habituais. Tudo isso
-- pressupõe histórico de compra. Quem nunca comprou não tinha onde existir —
-- daí "o sistema não capta clientes".
--
-- Prospect é tabela separada de cliente de propósito: cliente vem do Queóps e
-- é chaveado por código do ERP; prospect é cadastrado à mão e pode nunca
-- virar cliente. Misturar os dois sujaria a carteira com gente que não compra
-- e quebraria as métricas de ciclo, ticket e reativação.
create table if not exists public.vendas_prospects (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text,                       -- cafeteria, padaria, hotel, mercado, restaurante...
  origem text,                     -- prospecção ativa, indicação, instagram, cardápio web...
  endereco text,
  bairro text,
  cidade text,
  rota text not null default 'a_definir',
  telefone_raw text,
  contato_nome text,
  etapa text not null default 'a_contatar',
  motivo_perda text,
  valor_estimado numeric(12,2),
  observacoes text,
  responsavel_id uuid references public.profiles(id) on delete set null,
  -- Preenchido quando o prospect fecha: a partir daí ele é carteira, e a
  -- ligação serve para não prospectar de novo quem já virou cliente.
  cliente_id uuid references public.vendas_clientes(id) on delete set null,
  ganho_em date,
  ativo boolean not null default true,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.vendas_prospects drop constraint if exists vendas_prospects_etapa_valida;
alter table public.vendas_prospects add constraint vendas_prospects_etapa_valida
  check (etapa in ('a_contatar','em_conversa','degustacao','proposta','ganho','perdido'));

alter table public.vendas_prospects drop constraint if exists vendas_prospects_rota_valida;
alter table public.vendas_prospects add constraint vendas_prospects_rota_valida
  check (rota in ('poa','caminho_serra','serra','a_definir'));

-- Só faz sentido registrar por que perdeu quando perdeu.
alter table public.vendas_prospects drop constraint if exists vendas_prospects_perda_coerente;
alter table public.vendas_prospects add constraint vendas_prospects_perda_coerente
  check (motivo_perda is null or etapa = 'perdido');

create index if not exists vendas_prospects_etapa_idx on public.vendas_prospects (etapa) where ativo;
create index if not exists vendas_prospects_responsavel_idx on public.vendas_prospects (responsavel_id);

-- O contato passa a servir aos dois lados.
--
-- Reaproveitar `vendas_contatos` é o ponto: a bandeja "Aguardando resposta", a
-- correção do registro dentro de 7 dias e o histórico já funcionam. Duplicar
-- isso numa tabela de contatos de prospect significaria manter duas versões da
-- mesma regra, e elas divergiriam na primeira mudança.
alter table public.vendas_contatos
  add column if not exists prospect_id uuid references public.vendas_prospects(id) on delete cascade;

alter table public.vendas_contatos alter column cliente_id drop not null;

alter table public.vendas_contatos drop constraint if exists vendas_contatos_alvo_unico;
alter table public.vendas_contatos add constraint vendas_contatos_alvo_unico
  check ((cliente_id is not null) <> (prospect_id is not null));

create index if not exists vendas_contatos_prospect_idx on public.vendas_contatos (prospect_id, criado_em desc);

alter table public.vendas_prospects enable row level security;

drop policy if exists vendas_prospects_sel on public.vendas_prospects;
create policy vendas_prospects_sel on public.vendas_prospects for select to authenticated
  using (tem_papel_vendas(array['aprovador','vendas','comprador']));

drop policy if exists vendas_prospects_ins on public.vendas_prospects;
create policy vendas_prospects_ins on public.vendas_prospects for insert to authenticated
  with check (tem_papel_vendas(array['aprovador','vendas']));

drop policy if exists vendas_prospects_upd on public.vendas_prospects;
create policy vendas_prospects_upd on public.vendas_prospects for update to authenticated
  using (tem_papel_vendas(array['aprovador','vendas']));

drop policy if exists vendas_prospects_del on public.vendas_prospects;
create policy vendas_prospects_del on public.vendas_prospects for delete to authenticated
  using (tem_papel_vendas(array['aprovador']));
