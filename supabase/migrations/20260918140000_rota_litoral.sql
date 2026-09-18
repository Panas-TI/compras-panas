-- Rota do Litoral.
--
-- Diferente das outras: não tem dia fixo. A Serra é quinta, Porto Alegre é
-- segunda a sexta, e o Litoral é combinado pedido a pedido. Por isso a tela
-- não promete data para ele — prometer uma viagem que só existe quando é
-- combinada é pior do que não informar, porque o cliente ouve isso no telefone.
alter table public.vendas_clientes drop constraint if exists vendas_clientes_rota_valida;
alter table public.vendas_clientes add constraint vendas_clientes_rota_valida
  check (rota in ('poa', 'caminho_serra', 'serra', 'litoral', 'a_definir'));

alter table public.vendas_prospects drop constraint if exists vendas_prospects_rota_valida;
alter table public.vendas_prospects add constraint vendas_prospects_rota_valida
  check (rota in ('poa', 'caminho_serra', 'serra', 'litoral', 'a_definir'));

comment on column public.vendas_clientes.rota is
  'poa = segunda a sexta. serra = só quinta (Gramado, Canela). caminho_serra = '
  'qualquer dia útil, mas a quinta já passa por lá. litoral = sem dia fixo, '
  'combinado pedido a pedido. a_definir = indício de ser fora de POA, sem confirmação.';

-- Os dois que trazem a cidade no próprio nome. O resto continua como está:
-- endereço não serve para deduzir cidade neste cadastro.
update public.vendas_clientes set rota = 'litoral'
where nome ~* '(ATLANTIDA LAGOS|CAPAO DA CANOA)';
