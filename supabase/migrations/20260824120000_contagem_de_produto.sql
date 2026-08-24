-- Contagem de produto fabricado.
--
-- A contagem só sabia contar `itens` — matéria-prima comprada. Mas o estoquista
-- vai passar a contar diariamente o estoque de PRODUTO ACABADO (empanadas,
-- tortillas, pizzas, pratos), que vive em `produto` e nunca é comprado.
--
-- Cadastrar produto acabado como `itens` seria o caminho fácil e errado:
-- poluiria o catálogo de compras, e o mesmo produto passaria a existir em dois
-- lugares — exatamente o que a regra "item único" existe pra impedir.
--
-- A linha de contagem passa a apontar pra UM dos dois. Nenhum é obrigatório
-- (linha pode ser só texto), mas os dois juntos não fazem sentido.
ALTER TABLE public.template_itens
  ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES public.produto(id) ON DELETE SET NULL;

ALTER TABLE public.contagem_linhas
  ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES public.produto(id) ON DELETE SET NULL;

ALTER TABLE public.template_itens DROP CONSTRAINT IF EXISTS template_itens_um_alvo;
ALTER TABLE public.template_itens ADD CONSTRAINT template_itens_um_alvo
  CHECK (item_id IS NULL OR produto_id IS NULL);

ALTER TABLE public.contagem_linhas DROP CONSTRAINT IF EXISTS contagem_linhas_um_alvo;
ALTER TABLE public.contagem_linhas ADD CONSTRAINT contagem_linhas_um_alvo
  CHECK (item_id IS NULL OR produto_id IS NULL);

COMMENT ON COLUMN public.template_itens.produto_id IS
  'Produto fabricado a contar. Excludente com item_id: ou é compra (itens) ou é produção (produto).';

-- Mesma regra que já vale pra item: o mesmo produto não pode entrar duas vezes
-- na mesma pasta, senão duplica na contagem.
CREATE UNIQUE INDEX IF NOT EXISTS template_itens_produto_unico
  ON public.template_itens (template_id, produto_id) WHERE produto_id IS NOT NULL;
