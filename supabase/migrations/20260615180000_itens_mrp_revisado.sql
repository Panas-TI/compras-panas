-- Flag pra marcar itens como "já revisados" no MRP (não aparece mais na tela
-- de revisão de duplicatas).
ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS mrp_revisado BOOLEAN NOT NULL DEFAULT false;
