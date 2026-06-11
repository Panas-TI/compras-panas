-- Comprador ganha mesmos poderes que aprovador na área de Entregas.
-- Motorista e estoquista continuam restritos.

-- entregas
DROP POLICY IF EXISTS entregas_select ON public.entregas;
CREATE POLICY entregas_select ON public.entregas FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('aprovador', 'comprador')
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  );

DROP POLICY IF EXISTS entregas_insert ON public.entregas;
CREATE POLICY entregas_insert ON public.entregas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

DROP POLICY IF EXISTS entregas_update ON public.entregas;
CREATE POLICY entregas_update ON public.entregas FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('aprovador', 'comprador')
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('aprovador', 'comprador')
    OR (
      public.current_user_role() = 'motorista'
      AND (motorista_id = auth.uid() OR motorista_id IS NULL)
    )
  );

DROP POLICY IF EXISTS entregas_delete ON public.entregas;
CREATE POLICY entregas_delete ON public.entregas FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'));

-- entrega_log
DROP POLICY IF EXISTS entrega_log_select ON public.entrega_log;
CREATE POLICY entrega_log_select ON public.entrega_log FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('aprovador', 'comprador')
    OR EXISTS (
      SELECT 1 FROM public.entregas e
       WHERE e.id = entrega_log.entrega_id
         AND e.motorista_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS entrega_log_insert ON public.entrega_log;
CREATE POLICY entrega_log_insert ON public.entrega_log FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador', 'motorista'));

-- Storage: comprovantes
DROP POLICY IF EXISTS comprovantes_select ON storage.objects;
CREATE POLICY comprovantes_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND public.current_user_role() IN ('aprovador', 'comprador', 'motorista')
  );

DROP POLICY IF EXISTS comprovantes_insert ON storage.objects;
CREATE POLICY comprovantes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND public.current_user_role() IN ('aprovador', 'comprador', 'motorista')
  );

DROP POLICY IF EXISTS comprovantes_delete ON storage.objects;
CREATE POLICY comprovantes_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND public.current_user_role() IN ('aprovador', 'comprador')
  );

-- Storage: pedidos-originais
DROP POLICY IF EXISTS pedidos_originais_all ON storage.objects;
CREATE POLICY pedidos_originais_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'pedidos-originais'
    AND public.current_user_role() IN ('aprovador', 'comprador', 'motorista')
  )
  WITH CHECK (
    bucket_id = 'pedidos-originais'
    AND public.current_user_role() IN ('aprovador', 'comprador')
  );
