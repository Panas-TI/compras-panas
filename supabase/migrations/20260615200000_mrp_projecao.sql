-- MRP Etapa 6: tabelas de projeção
-- =====================================================================
-- projecao_producao: uma "rodada" de planejamento (quinta-feira)
-- projecao_demanda: pedidos previstos por produto
-- projecao_necessidade: resultado calculado (qtd por item de compra)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.projecao_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  data_calculo DATE NOT NULL DEFAULT CURRENT_DATE,
  contagem_id UUID REFERENCES public.contagens(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'calculada', 'convertida_em_solicitacao')),
  solicitacao_id UUID REFERENCES public.solicitacoes_semanais(id) ON DELETE SET NULL,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projecao_semana ON public.projecao_producao(semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_projecao_status ON public.projecao_producao(status);
CREATE TRIGGER set_updated_at_projecao BEFORE UPDATE ON public.projecao_producao
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.projecao_demanda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projecao_id UUID NOT NULL REFERENCES public.projecao_producao(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produto(id) ON DELETE RESTRICT,
  quantidade NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  observacoes TEXT,
  UNIQUE (projecao_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_projecao_demanda_proj ON public.projecao_demanda(projecao_id);

CREATE TABLE IF NOT EXISTS public.projecao_necessidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projecao_id UUID NOT NULL REFERENCES public.projecao_producao(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.itens(id) ON DELETE RESTRICT,
  necessidade_bruta NUMERIC(14,6) NOT NULL DEFAULT 0,
  estoque_atual NUMERIC(14,6) NOT NULL DEFAULT 0,
  necessidade_liquida NUMERIC(14,6) NOT NULL DEFAULT 0,
  quantidade_a_comprar NUMERIC(14,6) NOT NULL DEFAULT 0,
  unidade TEXT,
  alertas JSONB DEFAULT '[]'::jsonb,
  UNIQUE (projecao_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_projecao_necessidade_proj ON public.projecao_necessidade(projecao_id);

-- RLS: aprovador + comprador fazem tudo
ALTER TABLE public.projecao_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projecao_demanda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projecao_necessidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projecao_all ON public.projecao_producao;
CREATE POLICY projecao_all ON public.projecao_producao FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

DROP POLICY IF EXISTS projecao_demanda_all ON public.projecao_demanda;
CREATE POLICY projecao_demanda_all ON public.projecao_demanda FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

DROP POLICY IF EXISTS projecao_necessidade_all ON public.projecao_necessidade;
CREATE POLICY projecao_necessidade_all ON public.projecao_necessidade FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

-- Link de solicitacoes_semanais.projecao_id (existia mas sem FK)
ALTER TABLE public.solicitacoes_semanais
  DROP CONSTRAINT IF EXISTS solicitacoes_semanais_projecao_id_fkey;
ALTER TABLE public.solicitacoes_semanais
  ADD CONSTRAINT solicitacoes_semanais_projecao_id_fkey
  FOREIGN KEY (projecao_id) REFERENCES public.projecao_producao(id) ON DELETE SET NULL;
