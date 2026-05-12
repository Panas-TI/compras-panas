-- Faltou política de RLS pra DELETE em solicitações/linhas.
-- Mesma lógica do UPDATE: aprovador pode tudo; comprador só nas suas.

CREATE POLICY solic_delete ON public.solicitacoes_semanais
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'aprovador' OR comprador_id = auth.uid());

CREATE POLICY linhas_delete ON public.solicitacao_linhas
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (public.current_user_role() = 'aprovador' OR s.comprador_id = auth.uid())
  ));
