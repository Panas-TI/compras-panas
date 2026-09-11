-- Rota de entrega por cliente, e o dia em que cada um costuma pedir.
--
-- O sistema não sabia a cidade de ninguém: `entregas.cidade` existe e está
-- 100% vazia, e o texto do endereço é armadilha — "Anita Garibaldi", "Duque de
-- Caxias", "São Leopoldo" e "Bento Gonçalves" são ruas de Porto Alegre.
-- Classificar por endereço marcaria uma dúzia de clientes daqui como interior.
-- Por isso a rota é um campo próprio, com padrão seguro.

alter table public.vendas_clientes
  add column if not exists rota text not null default 'poa',
  add column if not exists dia_pedido_habitual smallint;

alter table public.vendas_clientes drop constraint if exists vendas_clientes_rota_valida;
alter table public.vendas_clientes add constraint vendas_clientes_rota_valida
  check (rota in ('poa', 'caminho_serra', 'serra', 'a_definir'));

comment on column public.vendas_clientes.rota is
  'poa = entrega de segunda a sexta. serra = só quinta (Gramado, Canela). '
  'caminho_serra = passa no trajeto da quinta, mas entrega qualquer dia útil. '
  'a_definir = tem indício de ser fora de Porto Alegre e ninguém confirmou ainda.';

comment on column public.vendas_clientes.dia_pedido_habitual is
  'Dia da semana (1=seg … 5=sex) em que o cliente concentra os pedidos. '
  'Null quando não há padrão claro — melhor calar do que inventar rotina.';

-- Semeia SÓ os que citam cidade no próprio nome. O nome é confiável porque a
-- cidade ali é parte do cadastro ("ATRIO HOTEIS S.A. - CANOAS/RS"); o endereço
-- não é. Entra como 'a_definir', nunca como rota adivinhada: mandar um cliente
-- pra quinta-feira por engano custa uma semana de venda.
update public.vendas_clientes
set rota = 'a_definir'
where rota = 'poa'
  and nome ~* '(GRAMADO|CANELA|CANOAS|CAXIAS|NOVO HAMBURGO|IGREJINHA|TAQUARA|TRES COROAS|SAO LEOPOLDO|ESTEIO|SAPUCAIA|NOVA PETROPOLIS|PORTAL DA SERRA|CAPAO DA CANOA)';

-- Dia habitual de pedido, dos últimos 12 meses.
--
-- Serve pra tela dizer "costuma pedir segunda — ligar quinta ou sexta" em vez
-- de deixar a pessoa deduzir. Exige padrão de verdade: o dia dominante precisa
-- valer 35% dos pedidos e haver ao menos 4. Abaixo disso é ruído, e rotina
-- inventada é pior que nenhuma.
create or replace function public.recalcular_dia_pedido_habitual()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
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
$$;

select public.recalcular_dia_pedido_habitual();
