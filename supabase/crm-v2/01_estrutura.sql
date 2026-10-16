-- CRM Panas · 01 · Estrutura
-- Tabelas novas com prefixo crm_. Nenhuma tabela atual é apagada:
-- vendas_pedidos, vendas_itens e vendas_importacoes continuam sendo o
-- registro das vendas do Queóps, e as contas herdam o id dos clientes
-- atuais para que os pedidos continuem apontando para o lugar certo.

create table crm_funis (
  id         text primary key check (id in ('prospeccao','recompra','reativacao')),
  nome       text not null,
  ordem      smallint not null unique,
  automatico boolean not null   -- recompra e reativação: o sistema cria e move
);

create table crm_etapas (
  id            uuid primary key default gen_random_uuid(),
  funil_id      text not null references crm_funis(id),
  nome          text not null,
  ordem         smallint not null,
  tipo          text not null check (tipo in ('aberta','ganha','perdida')),
  probabilidade numeric(5,2) not null default 0 check (probabilidade between 0 and 100),
  limite_dias   smallint check (limite_dias > 0),      -- esfria depois de N dias parada
  orientacao    text,                                  -- o que fazer nesta etapa
  unique (funil_id, ordem),
  unique (funil_id, nome),
  unique (id, funil_id)                                -- para a oportunidade não pular de funil
);

create table crm_segmentos (
  id   text primary key,
  nome text not null
);

create table crm_contas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  razao_social   text,
  cnpj           text unique check (cnpj ~ '^[0-9]{14}$'),
  segmento_id    text references crm_segmentos(id),
  ciclo_de_vida  text not null default 'cliente'
                 check (ciclo_de_vida in ('prospect','cliente','encerrado')),
  origem         text,
  rota           text not null default 'poa'
                 check (rota in ('poa','caminho_serra','serra','litoral','a_definir')),
  endereco       text,
  bairro         text,
  cidade         text,
  conta_mae_id   uuid references crm_contas(id),
  responsavel_id uuid references profiles(id),
  dias_contato   smallint[] check (
                   dias_contato is null
                   or (cardinality(dias_contato) between 1 and 7
                       and dias_contato <@ array[1,2,3,4,5,6,7]::smallint[]
                       and public.sem_dias_repetidos(dias_contato))),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (conta_mae_id is distinct from id)
);
create index crm_contas_nome on crm_contas (lower(nome));

-- Números da conta. Só o banco escreve; a tela só lê.
create table crm_conta_metricas (
  conta_id            uuid primary key references crm_contas(id) on delete cascade,
  primeira_compra     date,
  ultima_compra       date,
  pedidos             integer not null default 0,
  faturamento         numeric(14,2) not null default 0,
  ticket_medio        numeric(12,2),
  ciclo_dias          smallint,     -- mediana dos 8 últimos intervalos
  prevista_em         date,         -- ultima_compra + ciclo_dias
  situacao            text not null default 'sem_padrao'
                      check (situacao in ('ativo','atrasado','inativo','sem_padrao')),
  receita_anual_risco numeric(14,2),
  calculado_em        timestamptz not null default now()
);

create table crm_pessoas (
  id                 uuid primary key default gen_random_uuid(),
  conta_id           uuid not null references crm_contas(id) on delete cascade,
  nome               text,             -- vazio quando só se sabe o telefone; a ficha pede para completar
  papel              text check (papel in ('dono','comprador','gerente','financeiro','outro')),
  telefone_e164      text check (telefone_e164 ~ '^\+55[0-9]{10,11}$'),
  telefone_presumido boolean not null default false,   -- DDD assumido, conferir
  whatsapp           boolean not null default true,
  email              text,
  principal          boolean not null default false,
  criado_em          timestamptz not null default now()
);
create unique index crm_pessoas_uma_principal on crm_pessoas (conta_id) where principal;
create index crm_pessoas_telefone on crm_pessoas (telefone_e164);

-- Como a conta aparece no Queóps. Chave de casamento da importação.
create table crm_apelidos_erp (
  cadastro_original text primary key,
  conta_id          uuid not null references crm_contas(id),
  codigo_queops     text,
  conferido         boolean not null default false
);

create table crm_oportunidades (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid not null references crm_contas(id),
  funil_id       text not null references crm_funis(id),
  etapa_id       uuid not null,
  titulo         text not null,
  valor          numeric(12,2) not null default 0 check (valor >= 0),
  criada_por     text not null check (criada_por in ('pessoa','sistema')),
  ciclo_ref      date,             -- recompra: a data prevista que gerou esta oportunidade
  aberta_em      timestamptz not null default now(),
  etapa_desde    timestamptz not null default now(),
  fechada_em     timestamptz,
  motivo_perda   text,
  pedido_ganho   text references vendas_pedidos(pedido),
  pausada_ate    date,
  responsavel_id uuid references profiles(id),
  foreign key (etapa_id, funil_id) references crm_etapas (id, funil_id),
  check (funil_id <> 'recompra' or ciclo_ref is not null)
);
-- uma oportunidade aberta por conta e funil
create unique index crm_oport_uma_aberta on crm_oportunidades (conta_id, funil_id) where fechada_em is null;
-- recompra: uma por ciclo — perdida não renasce para a mesma data prevista
create unique index crm_oport_um_ciclo on crm_oportunidades (conta_id, ciclo_ref) where funil_id = 'recompra';
create index crm_oport_abertas on crm_oportunidades (funil_id, etapa_id) where fechada_em is null;

-- Toda mudança de etapa, com autor. Base de conversão e de tempo por etapa.
create table crm_oportunidade_etapas (
  id              bigint generated always as identity primary key,
  oportunidade_id uuid not null references crm_oportunidades(id) on delete cascade,
  etapa_de        uuid references crm_etapas(id),
  etapa_para      uuid not null references crm_etapas(id),
  em              timestamptz not null default now(),
  por             uuid references profiles(id),   -- nulo = sistema
  motivo          text
);
create index crm_oport_etapas_op on crm_oportunidade_etapas (oportunidade_id, em);

create table crm_atividades (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references crm_contas(id),
  oportunidade_id uuid references crm_oportunidades(id),
  pessoa_id       uuid references crm_pessoas(id),
  tipo            text not null default 'whatsapp'
                  check (tipo in ('whatsapp','ligacao','visita','amostra','tarefa')),
  status          text not null check (status in ('agendada','feita','cancelada')),
  para            date,             -- quando fazer
  para_hora       time,
  feita_em        timestamptz,
  resultado       text check (resultado in
                    ('sem_resposta','interessado','vai_pedir','pediu','nao_agora','recusou')),
  observacao      text,
  origem          text not null check (origem in ('pessoa','sistema')),
  tentativa       smallint check (tentativa between 1 and 10),   -- degrau da escada
  usuario_id      uuid references profiles(id),
  criado_em       timestamptz not null default now(),
  check (status <> 'feita'    or feita_em is not null),
  check (status <> 'agendada' or para is not null)
);
-- "Combinado" não é coluna: é atividade agendada com origem = 'pessoa'.
create index crm_ativ_agenda on crm_atividades (para) where status = 'agendada';
create index crm_ativ_conta  on crm_atividades (conta_id, criado_em desc);
create index crm_ativ_oport  on crm_atividades (oportunidade_id) where status = 'feita';

create table crm_notas (
  id        uuid primary key default gen_random_uuid(),
  conta_id  uuid not null references crm_contas(id) on delete cascade,
  texto     text not null check (length(trim(texto)) between 1 and 2000),
  fixada    boolean not null default false,
  autor_id  uuid references profiles(id),
  criado_em timestamptz not null default now()
);
create unique index crm_notas_uma_fixada on crm_notas (conta_id) where fixada;

create table crm_metas (
  semana      date primary key check (extract(isodow from semana) = 1),  -- segunda-feira
  faturamento numeric(12,2) not null check (faturamento > 0),
  positivacao numeric(5,2) check (positivacao between 0 and 100)          -- % da carteira
);

-- Foto diária da situação de cada conta: quem entrou e saiu de risco.
create table crm_situacao_diaria (
  dia      date not null,
  conta_id uuid not null references crm_contas(id) on delete cascade,
  situacao text not null,
  primary key (dia, conta_id)
);

-- Registro de cada execução das rotinas automáticas.
create table crm_rotinas (
  id     bigint generated always as identity primary key,
  rotina text not null,
  inicio timestamptz not null default now(),
  fim    timestamptz,
  status text not null default 'rodando' check (status in ('rodando','ok','erro')),
  linhas integer,
  erro   text
);
