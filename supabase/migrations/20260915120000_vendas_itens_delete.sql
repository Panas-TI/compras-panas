-- A importação precisa conseguir apagar os itens de um pedido pra regravar.
--
-- Havia política de SELECT, INSERT e UPDATE em vendas_itens, mas não de
-- DELETE. Com RLS, isso não dá erro: o delete apaga zero linhas em silêncio.
-- Toda vez que um pedido era atualizado na reimportação, os itens novos
-- entravam POR CIMA dos antigos. Em 15/09 havia 38 pedidos com 187 itens
-- duplicados, e o "costuma levar" de cada cliente contava produto em dobro.
--
-- Mesmos papéis que já podem atualizar os itens.
drop policy if exists vendas_itens_del on public.vendas_itens;
create policy vendas_itens_del on public.vendas_itens
  for delete to authenticated
  using (tem_papel_vendas(array['aprovador', 'vendas']));
