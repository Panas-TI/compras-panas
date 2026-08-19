-- O papel financeiro não conseguia LER solicitacao_linhas.
--
-- A tela de contagem mostra preço e fornecedor congelados lendo essa tabela
-- (commit 5aa0fcf). Sem a policy, a leitura voltava vazia e a tela caía no
-- preço ATUAL do catálogo em silêncio — número errado, sem aviso. Era o motivo
-- de eu não ter liberado o papel 'financeiro' junto com 'vendas'.
DROP POLICY IF EXISTS linhas_read ON public.solicitacao_linhas;
CREATE POLICY linhas_read ON public.solicitacao_linhas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.solicitacoes_semanais s
       WHERE s.id = solicitacao_linhas.solicitacao_id
         AND (
           public.current_user_role() = ANY (ARRAY['aprovador','estoquista','financeiro'])
           OR s.comprador_id = auth.uid()
         )
    )
  );

-- Com a leitura corrigida, o papel pode existir.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['comprador','aprovador','estoquista','motorista','vendas','financeiro']));
