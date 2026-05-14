-- Campos pra permitir que comprador/aprovador transformem linhas de contagem em pedidos
ALTER TABLE public.contagem_linhas
  ADD COLUMN IF NOT EXISTS solicitacao_qtd NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviado_solicitacao_id UUID
    REFERENCES public.solicitacoes_semanais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contagem_linhas_enviado
  ON public.contagem_linhas(enviado_solicitacao_id)
  WHERE enviado_solicitacao_id IS NOT NULL;
