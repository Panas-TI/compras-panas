-- Uma contagem gera UMA solicitação, sem item repetido.
--
-- Causa raiz (auditoria de 36 achados confirmados): o vínculo contagem→
-- solicitação nunca foi modelado. enviarParaSolicitacaoAction escolhia o
-- destino por ESTADO ("qualquer rascunho com enviada_em IS NULL") em vez de
-- por IDENTIDADE ("a solicitação desta contagem"). Qualquer rascunho vivo —
-- de outra contagem, do MRP, de outro usuário — era alvo válido.
-- Foi assim que a solicitação de 17/08 recebeu 2 linhas de um envio de 10/08
-- somadas às 77 de 13/08, duplicando ACEM e PRESUNTO.
--
-- Esta migration é ADITIVA. Os índices únicos entram só na migration B, depois
-- do código corrigido — senão o envio passa a estourar 23505 em produção.

-- 1) O vínculo que faltava.
ALTER TABLE public.solicitacoes_semanais
  ADD COLUMN IF NOT EXISTS contagem_id UUID REFERENCES public.contagens(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.solicitacoes_semanais.contagem_id IS
  'Contagem que originou esta solicitação. É por ela que o envio encontra o destino — nunca por "rascunho em aberto".';

-- 2) Marca as duplicatas históricas em vez de apagar.
--    Verificado: os 8 grupos estão em solicitações já lançadas, 3 das linhas
--    excedentes têm recebimento_entregas com ON DELETE CASCADE (apagar sumiria
--    com a entrega em silêncio) e os pares misturam 'Recusada' com
--    'Aprovada & Recebida', que não podem ser somados.
ALTER TABLE public.solicitacao_linhas
  ADD COLUMN IF NOT EXISTS duplicata_legada BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.solicitacao_linhas.duplicata_legada IS
  'Linha duplicada anterior à correção. Fica de fora do índice único para o passado seguir auditável sem impedir a regra de valer daqui pra frente.';

-- 3) origem passa a aceitar 'CONTAGEM'. Sem isso o insert do envio quebra, e o
--    relatório do MRP (que filtra origem='MRP') para de contar linha de
--    contagem como se fosse dele.
ALTER TABLE public.solicitacoes_semanais DROP CONSTRAINT IF EXISTS solicitacoes_semanais_origem_check;
ALTER TABLE public.solicitacoes_semanais ADD CONSTRAINT solicitacoes_semanais_origem_check
  CHECK (origem IS NULL OR origem IN ('manual', 'MRP', 'CONTAGEM'));

-- 4) Backfill do vínculo pelo caminho que já existe: contagem_linhas aponta
--    pra solicitação que recebeu suas linhas. Verificado antes: nenhuma
--    contagem gerou 2 solicitações, então não há conflito.
UPDATE public.solicitacoes_semanais s
   SET contagem_id = v.contagem_id
  FROM (
    SELECT DISTINCT ON (enviado_solicitacao_id) enviado_solicitacao_id, contagem_id
      FROM public.contagem_linhas
     WHERE enviado_solicitacao_id IS NOT NULL
     ORDER BY enviado_solicitacao_id, enviado_em
  ) v
 WHERE s.id = v.enviado_solicitacao_id AND s.contagem_id IS NULL;

-- 5) Marca as excedentes: mantém a primeira de cada grupo, sinaliza as demais.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY solicitacao_id, item_id ORDER BY criado_em) AS rn
    FROM public.solicitacao_linhas
)
UPDATE public.solicitacao_linhas sl
   SET duplicata_legada = true
  FROM ranked r
 WHERE sl.id = r.id AND r.rn > 1;
