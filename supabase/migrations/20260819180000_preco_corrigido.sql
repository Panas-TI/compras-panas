-- Financeiro pode corrigir preço em rascunho.
--
-- O campo era somente-leitura por decisão explícita, e havia uma armadilha
-- pior: enquanto a solicitação é rascunho, TODA renderização da página
-- reescrevia o preço da linha com o do catálogo. Liberar a edição sem tratar
-- isso faria a correção sumir no próximo F5 — falha silenciosa, pior que não
-- ter a funcionalidade.
--
-- Marcar quem corrigiu e quando resolve as duas pontas: a sincronização passa
-- a pular essas linhas, e o aprovador enxerga que aquele número foi mexido.
ALTER TABLE public.solicitacao_linhas
  ADD COLUMN IF NOT EXISTS preco_corrigido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preco_corrigido_por UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.solicitacao_linhas.preco_corrigido_em IS
  'Preenchido quando alguém corrige o preço à mão no rascunho. Enquanto não for nulo, a sincronização automática com o catálogo ignora esta linha.';

-- Financeiro precisa poder gravar a correção, não só ler.
DROP POLICY IF EXISTS linhas_update ON public.solicitacao_linhas;
CREATE POLICY linhas_update ON public.solicitacao_linhas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.solicitacoes_semanais s
       WHERE s.id = solicitacao_linhas.solicitacao_id
         AND (
           public.current_user_role() = ANY (ARRAY['aprovador','estoquista','financeiro'])
           OR s.comprador_id = auth.uid()
         )
    )
  );
