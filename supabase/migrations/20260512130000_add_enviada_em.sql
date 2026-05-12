-- Adiciona campo pra marcar quando comprador enviou a solicitação pra aprovação
ALTER TABLE public.solicitacoes_semanais
  ADD COLUMN IF NOT EXISTS enviada_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_enviada
  ON public.solicitacoes_semanais(enviada_em)
  WHERE enviada_em IS NOT NULL;

-- Para os históricos já importados, considerar como enviados na data de início
UPDATE public.solicitacoes_semanais
   SET enviada_em = (data_inicio::TIMESTAMPTZ)
 WHERE enviada_em IS NULL AND finalizada = true;
