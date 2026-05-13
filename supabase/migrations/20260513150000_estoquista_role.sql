-- Adiciona perfil 'estoquista' com acesso restrito (só recebimento e contagem)

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('comprador', 'aprovador', 'estoquista'));

-- Solicitações: estoquista pode LER tudo (precisa pra ver itens pra receber) mas não criar/editar
DROP POLICY IF EXISTS solic_read ON public.solicitacoes_semanais;
CREATE POLICY solic_read ON public.solicitacoes_semanais FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('aprovador', 'estoquista')
    OR comprador_id = auth.uid()
  );

-- Linhas: estoquista lê e ATUALIZA (pra marcar recebido)
DROP POLICY IF EXISTS linhas_read ON public.solicitacao_linhas;
CREATE POLICY linhas_read ON public.solicitacao_linhas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (
         public.current_user_role() IN ('aprovador', 'estoquista')
         OR s.comprador_id = auth.uid()
       )
  ));

DROP POLICY IF EXISTS linhas_update ON public.solicitacao_linhas;
CREATE POLICY linhas_update ON public.solicitacao_linhas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (
         public.current_user_role() IN ('aprovador', 'estoquista')
         OR s.comprador_id = auth.uid()
       )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (
         public.current_user_role() IN ('aprovador', 'estoquista')
         OR s.comprador_id = auth.uid()
       )
  ));

-- Contagem: estoquista pode tudo
DROP POLICY IF EXISTS cont_insert ON public.contagens;
DROP POLICY IF EXISTS cont_update ON public.contagens;
DROP POLICY IF EXISTS cont_delete ON public.contagens;
CREATE POLICY cont_insert ON public.contagens FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador', 'estoquista'));
CREATE POLICY cont_update ON public.contagens FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('comprador', 'aprovador', 'estoquista'))
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador', 'estoquista'));
CREATE POLICY cont_delete ON public.contagens FOR DELETE TO authenticated
  USING (public.current_user_role() = 'aprovador' OR criado_por = auth.uid());

DROP POLICY IF EXISTS contlin_all ON public.contagem_linhas;
CREATE POLICY contlin_all ON public.contagem_linhas FOR ALL TO authenticated
  USING (public.current_user_role() IN ('comprador', 'aprovador', 'estoquista'))
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador', 'estoquista'));

-- Itens / cadastros: estoquista LÊ (já é público), mas não pode escrever
-- Não precisa mexer porque as policies de escrita continuam restritas a comprador/aprovador
