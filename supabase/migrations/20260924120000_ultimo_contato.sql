-- O plano do dia lia a tabela inteira de contatos em duas consultas cruas, sem
-- limite: uma pra saber quem está silenciado, outra pra achar o último contato
-- de cada cliente. Com 315 linhas ainda cabe; passando de 1000 o PostgREST
-- corta em silêncio e a consulta de silenciados nem tem ordem — quem some do
-- corte é sorteio. A view entrega uma linha por cliente e o plano lê ~100.
--
-- security_invoker: a view roda com as permissões de quem chama, então as
-- políticas de RLS de vendas_contatos continuam valendo. Sem isso a view
-- vazaria contato de todo mundo pra qualquer papel.
drop view if exists vendas_ultimo_contato;
create view vendas_ultimo_contato
with (security_invoker = true) as
select distinct on (cliente_id)
  cliente_id,
  id            as contato_id,
  resultado,
  adiar_ate,
  observacao,
  motivo,
  criado_em,
  atualizado_em,
  concluido_em
from vendas_contatos
where cliente_id is not null
order by cliente_id, criado_em desc, id desc;

comment on view vendas_ultimo_contato is
  'Último contato registrado de cada cliente. Fonte única do que silencia a fila do dia e do que vira retorno combinado.';

grant select on vendas_ultimo_contato to authenticated;
