-- Importação semanal de vendas.
--
-- Os 14.833 pedidos existentes entraram por um script fora do repositório e
-- desde então nada atualizava a base — a carteira envelhecia em silêncio e a
-- fila de hoje passava a apontar cliente errado. Esta migration prepara o
-- caminho pra importação pela própria tela.

-- 1) Mapeamento de colunas: o arquivo do ERP tem os cabeçalhos que tiver.
--    Guardamos o de-para uma vez e reusamos nas importações seguintes.
CREATE TABLE IF NOT EXISTS public.vendas_import_mapeamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  -- { "pedido": "Nº Pedido", "data": "Data", "cliente": "Cliente", ... }
  colunas JSONB NOT NULL,
  criado_por UUID REFERENCES public.profiles(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendas_import_mapeamentos_nome
  ON public.vendas_import_mapeamentos (lower(nome));

ALTER TABLE public.vendas_import_mapeamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mapeamentos_read ON public.vendas_import_mapeamentos;
CREATE POLICY mapeamentos_read ON public.vendas_import_mapeamentos
  FOR SELECT USING (public.tem_papel_vendas(ARRAY['aprovador','vendas','comprador']));

DROP POLICY IF EXISTS mapeamentos_write ON public.vendas_import_mapeamentos;
CREATE POLICY mapeamentos_write ON public.vendas_import_mapeamentos
  FOR ALL USING (public.tem_papel_vendas(ARRAY['aprovador','vendas']))
  WITH CHECK (public.tem_papel_vendas(ARRAY['aprovador','vendas']));

-- 2) O pedido é a chave natural do arquivo do ERP. Sem unicidade, reimportar a
--    mesma semana duplicaria a receita de todo mundo.
CREATE UNIQUE INDEX IF NOT EXISTS vendas_pedidos_pedido_unico
  ON public.vendas_pedidos (pedido);

-- 3) O recálculo pós-importação já está pronto no banco e é chamado pela tela:
--      recalcular_metricas_vendas()   -> frequência, ticket, status, ciclo
--      recalcular_itens_habituais()   -> top 5 produtos do cliente
--    receita_anual_risco não precisa de nenhuma das duas: é coluna GERADA.
--
--    Cheguei a criar uma recalcular_metricas_vendas_extra() aqui antes de
--    perceber que recalcular_itens_habituais() já fazia o mesmo. Removendo,
--    pra não deixar duas funções concorrentes fazendo a mesma conta.
DROP FUNCTION IF EXISTS public.recalcular_metricas_vendas_extra();
