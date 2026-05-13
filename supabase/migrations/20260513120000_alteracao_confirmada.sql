-- Marca se uma linha em "Volumes ou Preço Alterados" já foi CONFIRMADA pelo aprovador.
-- Sem confirmação: linha editável; com confirmação: travada.

ALTER TABLE public.solicitacao_linhas
  ADD COLUMN IF NOT EXISTS alteracao_confirmada BOOLEAN NOT NULL DEFAULT false;

-- Históricos já importados ficam tratados como confirmados.
-- Desabilita temporariamente o trigger que valida código Queóps durante o UPDATE.
ALTER TABLE public.solicitacao_linhas DISABLE TRIGGER linha_approval;

UPDATE public.solicitacao_linhas
   SET alteracao_confirmada = true
 WHERE status = 'Volumes ou Preço Alterados';

ALTER TABLE public.solicitacao_linhas ENABLE TRIGGER linha_approval;
