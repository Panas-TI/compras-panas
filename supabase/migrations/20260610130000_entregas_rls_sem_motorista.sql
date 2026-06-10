-- Permite motorista ler/atualizar entregas SEM dono (motorista_id IS NULL).
-- Necessário pro fluxo: motorista vê todos pendentes do dia, bipa pra marcar
-- entregue, sistema atribui automaticamente motorista_id = auth.uid().

DROP POLICY IF EXISTS entregas_select ON public.entregas;
CREATE POLICY entregas_select ON public.entregas FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'aprovador'
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  );

DROP POLICY IF EXISTS entregas_update ON public.entregas;
CREATE POLICY entregas_update ON public.entregas FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'aprovador'
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  )
  WITH CHECK (
    public.current_user_role() = 'aprovador'
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  );
