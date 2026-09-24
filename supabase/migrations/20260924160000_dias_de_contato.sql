-- Dias em que ESTE cliente deve ser chamado, escolhidos pelo vendedor.
--
-- Já existia dia_pedido_habitual, mas é outra coisa: é inferido do histórico
-- ("costuma pedir na quinta") e ninguém edita. Serve de dica no cartão, não de
-- agenda. Faltava dizer ao sistema "a banca do Plínio eu falo segunda, terça e
-- quinta" — combinação que existe na cabeça de quem atende e em lugar nenhum.
--
-- 1 = segunda … 7 = domingo, a mesma convenção de diaDaSemana() em
-- rota-regras.ts. Array e não um dia só porque o caso real é vários.
--
-- Null e {} são estados diferentes de propósito: null é "não tem agenda, siga
-- o ciclo de compra"; um array vazio seria "nunca ligar", que se diz
-- desativando o cliente. A trava impede o vazio justamente pra ninguém sumir
-- com um cliente sem querer.
alter table vendas_clientes
  add column if not exists dias_contato smallint[];

create or replace function sem_dias_repetidos(dias smallint[])
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select cardinality(dias) = (select count(distinct d) from unnest(dias) d);
$$;

alter table vendas_clientes
  drop constraint if exists vendas_clientes_dias_contato_valido;

alter table vendas_clientes
  add constraint vendas_clientes_dias_contato_valido check (
    dias_contato is null
    or (
      -- cardinality e não array_length: em array vazio array_length devolve
      -- NULL, NULL num CHECK passa, e o {} que esta trava existe pra barrar
      -- entrava calado.
      cardinality(dias_contato) between 1 and 7
      and dias_contato <@ array[1,2,3,4,5,6,7]::smallint[]
      -- Sem repetido: {1,1,4} é erro de clique, e contaria "segunda" duas
      -- vezes em qualquer soma futura. Via função porque CHECK não aceita
      -- subconsulta, e sem ela não dá pra contar valores distintos.
      and sem_dias_repetidos(dias_contato)
    )
  );

comment on column vendas_clientes.dias_contato is
  'Dias da semana em que o vendedor quer falar com este cliente (1=segunda..7=domingo). Null = sem agenda, vale o ciclo de compra.';
