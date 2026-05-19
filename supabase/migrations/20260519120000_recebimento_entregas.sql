-- Recebimentos parciais: uma linha de solicitação pode receber mercadoria
-- em várias entregas (ex: 140 un segunda + 160 un quarta).

CREATE TABLE IF NOT EXISTS public.recebimento_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id UUID NOT NULL REFERENCES public.solicitacao_linhas(id) ON DELETE CASCADE,
  quantidade NUMERIC(14,3) NOT NULL,
  data_recebimento DATE NOT NULL,
  observacao TEXT,
  criado_por UUID REFERENCES public.profiles(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receb_entregas_linha ON public.recebimento_entregas(linha_id);

ALTER TABLE public.recebimento_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receb_entregas_read ON public.recebimento_entregas;
CREATE POLICY receb_entregas_read ON public.recebimento_entregas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS receb_entregas_all ON public.recebimento_entregas;
CREATE POLICY receb_entregas_all ON public.recebimento_entregas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('comprador','aprovador','estoquista'))
  WITH CHECK (public.current_user_role() IN ('comprador','aprovador','estoquista'));
