-- Embalagem de compra: estoque conta por unidade, financeiro compra por caixa/fardo.
-- Ex: BOBINA TÉRMICA é contada por UNIDADE (preço R$ 3,50/un), mas comprada em
-- CAIXA de 30 un. Então 1 caixa = 30 un = R$ 105,00; 2 caixas = 60 un.
--
-- embalagem_compra_nome: rótulo da embalagem de compra (ex: "CAIXA", "FARDO").
--   NULL/vazio = item comprado avulso, sem embalagem mínima.
-- qtd_por_embalagem: quantas unidades (na unidade de estoque) tem 1 embalagem.
--   Default 1 = compra por unidade (comportamento antigo).

ALTER TABLE public.itens
  ADD COLUMN IF NOT EXISTS embalagem_compra_nome TEXT,
  ADD COLUMN IF NOT EXISTS qtd_por_embalagem NUMERIC NOT NULL DEFAULT 1
    CHECK (qtd_por_embalagem >= 1);

COMMENT ON COLUMN public.itens.embalagem_compra_nome IS 'Rótulo da embalagem de compra (CAIXA, FARDO). NULL = avulso.';
COMMENT ON COLUMN public.itens.qtd_por_embalagem IS 'Unidades por embalagem de compra. 1 = compra por unidade.';
