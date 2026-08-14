-- Justificativa da compra, preenchida por quem faz a solicitação (comprador/
-- aprovador) DEPOIS que a contagem foi finalizada.
--
-- Campo separado de `observacao` de propósito: aquela pertence ao estoquista e
-- descreve a contagem ("peça veio faltando"); esta pertence a quem compra e
-- justifica o pedido ("estoque baixo, evento no sábado"). Dois autores, dois
-- momentos — reusar o mesmo campo faria um sobrescrever o outro.
--
-- Aditivo: não toca em nenhum dado existente.
ALTER TABLE public.contagem_linhas
  ADD COLUMN IF NOT EXISTS observacao_solicitacao TEXT;

COMMENT ON COLUMN public.contagem_linhas.observacao_solicitacao IS
  'Justificativa da compra (comprador/aprovador, pós-finalização). Não confundir com observacao, que é a nota do estoquista sobre a contagem.';
