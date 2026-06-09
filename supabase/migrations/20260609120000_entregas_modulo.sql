-- =====================================================================
-- Módulo Entregas: schema, perfil 'motorista', RLS e Storage buckets.
-- =====================================================================

-- 1) Adiciona role 'motorista' ao check constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('comprador', 'aprovador', 'estoquista', 'motorista'));

-- =====================================================================
-- 2) Tabela entregas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do pedido Queóps (OCR)
  codigo_queops TEXT NOT NULL UNIQUE,
  data_entrega DATE NOT NULL,
  hora_entrega TIME,
  area_entrega INT,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT,
  contato_nome TEXT,
  endereco_rua TEXT NOT NULL,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR length(uf) = 2),
  observacoes TEXT,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_fisico NUMERIC(12,3),
  itens_json JSONB DEFAULT '[]'::jsonb,

  -- Foto do pedido impresso original
  foto_pedido_original_url TEXT,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_rota', 'entregue', 'nao_entregue', 'cancelada')),
  motorista_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Eventos de execução
  checkin_at TIMESTAMPTZ,
  entregue_at TIMESTAMPTZ,
  entrega_lat NUMERIC(10,7),
  entrega_lng NUMERIC(10,7),
  entrega_precisao_metros INT,
  gps_negado BOOLEAN NOT NULL DEFAULT false,
  foto_comprovante_url TEXT,
  assinatura_cliente_url TEXT,
  motivo_nao_entrega TEXT,

  -- Custo OCR (rastrear gasto Claude API)
  custo_ocr_usd NUMERIC(8,4)
);

CREATE INDEX IF NOT EXISTS idx_entregas_data ON public.entregas(data_entrega DESC);
CREATE INDEX IF NOT EXISTS idx_entregas_status ON public.entregas(status);
CREATE INDEX IF NOT EXISTS idx_entregas_motorista ON public.entregas(motorista_id, data_entrega DESC);
CREATE INDEX IF NOT EXISTS idx_entregas_codigo ON public.entregas(codigo_queops);

CREATE TRIGGER set_updated_at_entregas BEFORE UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- 3) Tabela entrega_log (audit)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.entrega_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id UUID NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.profiles(id),
  acao TEXT NOT NULL,
  dados_antes JSONB,
  dados_depois JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entrega_log_entrega ON public.entrega_log(entrega_id, created_at DESC);

-- =====================================================================
-- 4) RLS
-- =====================================================================
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_log ENABLE ROW LEVEL SECURITY;

-- entregas: aprovador faz tudo; motorista lê só as dele e pode dar update (checkin/entregue)
DROP POLICY IF EXISTS entregas_select ON public.entregas;
CREATE POLICY entregas_select ON public.entregas FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'aprovador'
    OR (public.current_user_role() = 'motorista' AND motorista_id = auth.uid())
  );

DROP POLICY IF EXISTS entregas_insert ON public.entregas;
CREATE POLICY entregas_insert ON public.entregas FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'aprovador');

DROP POLICY IF EXISTS entregas_update ON public.entregas;
CREATE POLICY entregas_update ON public.entregas FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'aprovador'
    OR (public.current_user_role() = 'motorista' AND motorista_id = auth.uid())
  )
  WITH CHECK (
    public.current_user_role() = 'aprovador'
    OR (public.current_user_role() = 'motorista' AND motorista_id = auth.uid())
  );

DROP POLICY IF EXISTS entregas_delete ON public.entregas;
CREATE POLICY entregas_delete ON public.entregas FOR DELETE TO authenticated
  USING (public.current_user_role() = 'aprovador');

-- entrega_log: aprovador lê tudo; motorista vê só logs das próprias entregas; insert é livre (server action grava)
DROP POLICY IF EXISTS entrega_log_select ON public.entrega_log;
CREATE POLICY entrega_log_select ON public.entrega_log FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'aprovador'
    OR EXISTS (
      SELECT 1 FROM public.entregas e
       WHERE e.id = entrega_log.entrega_id
         AND e.motorista_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS entrega_log_insert ON public.entrega_log;
CREATE POLICY entrega_log_insert ON public.entrega_log FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('aprovador', 'motorista')
  );

-- =====================================================================
-- 5) Storage Buckets
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('pedidos-originais', 'pedidos-originais', false, 5242880,
    ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('comprovantes', 'comprovantes', false, 5242880,
    ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: aprovador faz tudo nos dois buckets
DROP POLICY IF EXISTS pedidos_originais_all ON storage.objects;
CREATE POLICY pedidos_originais_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'pedidos-originais'
    AND (
      public.current_user_role() = 'aprovador'
      OR (
        public.current_user_role() = 'motorista'
        -- motorista pode LER (SELECT) pra ver foto do pedido dele
      )
    )
  )
  WITH CHECK (
    bucket_id = 'pedidos-originais'
    AND public.current_user_role() = 'aprovador'
  );

DROP POLICY IF EXISTS comprovantes_select ON storage.objects;
CREATE POLICY comprovantes_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND public.current_user_role() IN ('aprovador', 'motorista')
  );

DROP POLICY IF EXISTS comprovantes_insert ON storage.objects;
CREATE POLICY comprovantes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND public.current_user_role() IN ('aprovador', 'motorista')
  );

DROP POLICY IF EXISTS comprovantes_delete ON storage.objects;
CREATE POLICY comprovantes_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprovantes'
    AND public.current_user_role() = 'aprovador'
  );
