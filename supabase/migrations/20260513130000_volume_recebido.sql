-- Campo separado pra quantidade efetivamente recebida (pode ser diferente do solicitado)
ALTER TABLE public.solicitacao_linhas
  ADD COLUMN IF NOT EXISTS volume_recebido NUMERIC(12,3);
