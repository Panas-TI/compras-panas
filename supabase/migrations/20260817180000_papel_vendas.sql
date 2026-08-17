-- Libera o papel 'vendas' (atendente/vendedor).
--
-- O módulo Vendas inteiro já foi construído em cima dele — guard.ts, o nav, o
-- redirecionamento da home, as políticas de escrita de contato e importação —
-- mas o CHECK de profiles.role só aceitava comprador/aprovador/estoquista/
-- motorista. Ou seja: o papel existia no código e era impossível atribuir a
-- alguém; o banco recusava. Por isso não há nenhum usuário 'vendas' hoje.
--
-- 'financeiro' fica DE FORA de propósito: o código também o referencia, mas a
-- policy linhas_read de solicitacao_linhas não o inclui. Um usuário financeiro
-- veria a contagem com preço do catálogo em vez do preço congelado, sem aviso.
-- Liberar antes de corrigir a policy criaria um papel quebrado.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'comprador'::text,
    'aprovador'::text,
    'estoquista'::text,
    'motorista'::text,
    'vendas'::text
  ]));
