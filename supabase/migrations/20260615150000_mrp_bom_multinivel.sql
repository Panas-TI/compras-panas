-- =====================================================================
-- MRP: estrutura BOM multi-nível (intermediários viram produtos)
-- =====================================================================
-- Antes: intermediários (RECHEIO CARNE, MASSA EMPANADA etc) estavam misturados
-- com matérias-primas. Fichas técnicas só apontavam pra matéria_prima.
--
-- Agora: intermediários são PRODUTOS. Linhas de ficha podem apontar pra
-- produto (intermediário) OU materia_prima (folha). MRP explode a árvore
-- recursivamente até as folhas pra calcular necessidade real.
-- =====================================================================

-- 1) Adiciona produto_referenciado_id e relaxa materia_prima_id em ficha_item
ALTER TABLE public.ficha_item
  ALTER COLUMN materia_prima_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS produto_referenciado_id UUID
    REFERENCES public.produto(id) ON DELETE RESTRICT;

-- Exatamente UM dos dois deve estar preenchido
ALTER TABLE public.ficha_item DROP CONSTRAINT IF EXISTS ficha_item_exclusivo;
ALTER TABLE public.ficha_item ADD CONSTRAINT ficha_item_exclusivo
  CHECK (
    (materia_prima_id IS NOT NULL AND produto_referenciado_id IS NULL)
    OR (materia_prima_id IS NULL AND produto_referenciado_id IS NOT NULL)
  );

-- Unique antigo era (ficha_id, materia_prima_id) — agora também o produto_referenciado
ALTER TABLE public.ficha_item DROP CONSTRAINT IF EXISTS ficha_item_ficha_id_materia_prima_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ficha_item_unique_mp
  ON public.ficha_item(ficha_id, materia_prima_id)
  WHERE materia_prima_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ficha_item_unique_prod
  ON public.ficha_item(ficha_id, produto_referenciado_id)
  WHERE produto_referenciado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ficha_item_prod_ref
  ON public.ficha_item(produto_referenciado_id);

-- 2) Categoria INTERMEDIARIO no produto (sem necessidade de migration extra,
--    é só uma string em categoria)

-- 3) Adicionar campo 'tipo' em produto pra UI distinguir final vs intermediário
ALTER TABLE public.produto
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'final'
    CHECK (tipo IN ('final', 'intermediario'));
CREATE INDEX IF NOT EXISTS idx_produto_tipo ON public.produto(tipo);

-- 4) Tipo 'ignorado' em materia_prima já existe e continua igual
--    (mão-de-obra, água DMAE)

-- 5) Limpa dados anteriores do MRP — vai ser tudo reimportado do .xls
TRUNCATE public.ficha_item CASCADE;
DELETE FROM public.ficha_tecnica;
DELETE FROM public.produto;
DELETE FROM public.materia_prima;
