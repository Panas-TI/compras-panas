-- "O que o cliente disse" era só texto livre: cada vendedor escrevia de um
-- jeito e não dava pra agrupar nada. Agora o motivo vira opção fechada em
-- coluna própria, e o texto livre segue existindo pro detalhe ("queria 10%
-- de desconto", "responsável novo se chama X").
--
-- Aditivo: os contatos já registrados ficam com motivo nulo e observação
-- intacta.
ALTER TABLE public.vendas_contatos
  ADD COLUMN IF NOT EXISTS motivo TEXT;

COMMENT ON COLUMN public.vendas_contatos.motivo IS
  'O que o cliente disse, em opção fechada (ver MOTIVOS_CONTATO em vendas/ui.tsx). "Outro" manda o vendedor detalhar em observacao.';

CREATE INDEX IF NOT EXISTS idx_vendas_contatos_motivo
  ON public.vendas_contatos (motivo) WHERE motivo IS NOT NULL;
