-- =====================================================================
-- MRP: usar `itens` direto em vez de tabela `materia_prima` separada
-- =====================================================================
-- Refator a pedido do usuário: matéria-prima e item de compra é a MESMA coisa.
-- Vamos eliminar a duplicação.
--
-- Antes:
--   ficha_item.materia_prima_id → materia_prima.item_compra_id → itens
-- Depois:
--   ficha_item.item_id → itens
--
-- + cria itens novos pros códigos que estavam só em materia_prima sem item
-- + remove linhas de ficha que apontavam pra ignorados (mão de obra, água DMAE)
-- + dropa tabela materia_prima
-- =====================================================================

-- 1) Adiciona item_id em ficha_item (será NOT NULL depois da migração)
ALTER TABLE public.ficha_item
  ADD COLUMN IF NOT EXISTS item_id UUID
    REFERENCES public.itens(id) ON DELETE RESTRICT;

-- 2) Adiciona unidade_ficha em itens (opcional, pra quando ficha usa unidade
--    diferente da de compra — ex: ficha em g, compra em kg)
ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS unidade_ficha TEXT;

-- 3) Adiciona fator_conversao em itens (multiplicador unidade_ficha → unidade
--    de compra). Default 1 (unidades iguais).
ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS fator_conversao_ficha NUMERIC(14,6) DEFAULT 1;

-- 4) Mapa: pra cada materia_prima usada em ficha, achar/criar item correspondente
--    Cria itens novos pros que não existem (codigo_queops match exato)

-- 4a) Pega uma classificação default (qualquer ativa) pros novos itens
DO $$
DECLARE
  classif_default UUID;
  unid_default UUID;
BEGIN
  SELECT id INTO classif_default FROM public.classificacoes WHERE ativo=true LIMIT 1;
  SELECT id INTO unid_default FROM public.unidades_medida WHERE ativo=true LIMIT 1;

  -- Cria itens novos pros codigos de matéria_prima FOLHA que NÃO existem em itens
  INSERT INTO public.itens (codigo_queops, nome, classificacao_id, unidade_id, ativo)
  SELECT mp.codigo_queops, mp.nome, classif_default, unid_default, true
  FROM public.materia_prima mp
  WHERE mp.tipo = 'folha'
    AND mp.codigo_queops IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.itens i WHERE i.codigo_queops = mp.codigo_queops
    );

  -- Atualiza item_compra_id das mps que agora têm item correspondente
  UPDATE public.materia_prima mp
  SET item_compra_id = i.id
  FROM public.itens i
  WHERE mp.codigo_queops = i.codigo_queops
    AND mp.item_compra_id IS NULL;
END $$;

-- 5) Migra ficha_item.materia_prima_id → item_id
UPDATE public.ficha_item fi
SET item_id = mp.item_compra_id
FROM public.materia_prima mp
WHERE fi.materia_prima_id = mp.id
  AND mp.item_compra_id IS NOT NULL;

-- 6) Apaga ficha_item que apontavam pra ignorados (mão obra, água DMAE)
DELETE FROM public.ficha_item fi
USING public.materia_prima mp
WHERE fi.materia_prima_id = mp.id
  AND mp.tipo = 'ignorado';

-- 7) Atualiza constraint exclusivo
ALTER TABLE public.ficha_item DROP CONSTRAINT IF EXISTS ficha_item_exclusivo;
ALTER TABLE public.ficha_item ADD CONSTRAINT ficha_item_exclusivo
  CHECK (
    (item_id IS NOT NULL AND produto_referenciado_id IS NULL)
    OR (item_id IS NULL AND produto_referenciado_id IS NOT NULL)
  );

-- 8) Recria índices únicos
DROP INDEX IF EXISTS idx_ficha_item_unique_mp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ficha_item_unique_item
  ON public.ficha_item(ficha_id, item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ficha_item_item ON public.ficha_item(item_id);

-- 9) Drop coluna materia_prima_id
ALTER TABLE public.ficha_item DROP COLUMN IF EXISTS materia_prima_id;

-- 10) Drop tabela materia_prima (não tem mais ninguém apontando)
DROP TABLE IF EXISTS public.materia_prima;
