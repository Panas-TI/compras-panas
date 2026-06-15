-- =====================================================================
-- Módulo MRP — schema base (produto, materia_prima, ficha_tecnica, ficha_item)
-- + extensão de solicitacoes_semanais pra integração futura
-- =====================================================================

-- ===== Produto =====
CREATE TABLE IF NOT EXISTS public.produto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_queops TEXT UNIQUE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'EMPANADA',
  unidade_producao TEXT NOT NULL DEFAULT 'UN',
  rendimento_padrao NUMERIC(10,4) NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produto_categoria ON public.produto(categoria);
CREATE INDEX IF NOT EXISTS idx_produto_ativo ON public.produto(ativo);
CREATE TRIGGER set_updated_at_produto BEFORE UPDATE ON public.produto
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== Matéria-prima =====
CREATE TABLE IF NOT EXISTS public.materia_prima (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_queops TEXT UNIQUE,
  nome TEXT NOT NULL,
  unidade_base TEXT NOT NULL DEFAULT 'kg',
  item_compra_id UUID REFERENCES public.itens(id) ON DELETE SET NULL,
  fator_conversao NUMERIC(14,6) NOT NULL DEFAULT 1,
  ativa BOOLEAN NOT NULL DEFAULT true,
  -- Flags pra UX no /mrp/materias-primas:
  nao_compravel BOOLEAN NOT NULL DEFAULT false,
  bug_revisao BOOLEAN NOT NULL DEFAULT false,
  -- Tipo: 'folha' (vira compra), 'intermediario' (recheio/massa), 'ignorado' (mão obra, água)
  tipo TEXT NOT NULL DEFAULT 'folha'
    CHECK (tipo IN ('folha', 'intermediario', 'ignorado')),
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_tipo ON public.materia_prima(tipo);
CREATE INDEX IF NOT EXISTS idx_mp_item ON public.materia_prima(item_compra_id);
CREATE TRIGGER set_updated_at_mp BEFORE UPDATE ON public.materia_prima
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== Ficha técnica (versionada) =====
CREATE TABLE IF NOT EXISTS public.ficha_tecnica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produto(id) ON DELETE CASCADE,
  versao INT NOT NULL,
  vigente BOOLEAN NOT NULL DEFAULT false,
  data_vigencia_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vigencia_fim DATE,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  UNIQUE (produto_id, versao)
);
CREATE INDEX IF NOT EXISTS idx_ficha_produto ON public.ficha_tecnica(produto_id);
-- Só pode ter UMA versão vigente por produto
CREATE UNIQUE INDEX IF NOT EXISTS idx_ficha_vigente_unique
  ON public.ficha_tecnica(produto_id)
  WHERE vigente = true;

-- ===== Linhas da ficha técnica =====
CREATE TABLE IF NOT EXISTS public.ficha_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id UUID NOT NULL REFERENCES public.ficha_tecnica(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES public.materia_prima(id) ON DELETE RESTRICT,
  quantidade NUMERIC(14,6) NOT NULL,
  merma_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  ordem INT NOT NULL DEFAULT 0,
  UNIQUE (ficha_id, materia_prima_id)
);
CREATE INDEX IF NOT EXISTS idx_ficha_item_ficha ON public.ficha_item(ficha_id, ordem);

-- =====================================================================
-- Extensão de solicitacoes_semanais (origem da solicitação)
-- =====================================================================
ALTER TABLE public.solicitacoes_semanais
  ADD COLUMN IF NOT EXISTS origem TEXT
    CHECK (origem IS NULL OR origem IN ('manual', 'MRP'));

-- projecao_id ficará nullable; a tabela projecao_producao será criada na Etapa 6
-- (do MRP). Por enquanto só preparo o campo:
ALTER TABLE public.solicitacoes_semanais
  ADD COLUMN IF NOT EXISTS projecao_id UUID;

-- =====================================================================
-- RLS — produto, materia_prima, ficha_tecnica, ficha_item
-- Comprador e aprovador podem tudo. Estoquista/motorista não acessam.
-- =====================================================================
ALTER TABLE public.produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materia_prima ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_tecnica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_item ENABLE ROW LEVEL SECURITY;

-- Produto
DROP POLICY IF EXISTS produto_all ON public.produto;
CREATE POLICY produto_all ON public.produto FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

-- Materia-prima
DROP POLICY IF EXISTS mp_all ON public.materia_prima;
CREATE POLICY mp_all ON public.materia_prima FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

-- Ficha técnica
DROP POLICY IF EXISTS ficha_all ON public.ficha_tecnica;
CREATE POLICY ficha_all ON public.ficha_tecnica FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));

-- Ficha item
DROP POLICY IF EXISTS ficha_item_all ON public.ficha_item;
CREATE POLICY ficha_item_all ON public.ficha_item FOR ALL TO authenticated
  USING (public.current_user_role() IN ('aprovador', 'comprador'))
  WITH CHECK (public.current_user_role() IN ('aprovador', 'comprador'));
