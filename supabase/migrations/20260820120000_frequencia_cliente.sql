-- Classificação de frequência de compra.
--
-- Responde uma pergunta DIFERENTE da que o campo `status` responde, e por isso
-- as duas convivem:
--   status            -> "ele quebrou o ritmo DELE?"    (serve à fila diária)
--   frequencia_classe -> "com que frequência ele compra?" (serve à segmentação)
--
-- Elas divergem em 81 clientes, e está certo divergirem. O MAGAZINO compra a
-- cada 3 dias e parou há 41: pelo ritmo dele é 'inativo' e precisa de ligação
-- hoje; pela frequência é 'media', porque quando compra, compra 2 a 4x no mês.
-- Fundir as duas perderia uma das informações.
--
-- Três definições que a regra escrita deixava em aberto:
--   1. "por mês" = média mensal dos ÚLTIMOS 3 MESES. Não o mês corrente (no dia
--      2 todo mundo pareceria ruim) nem os últimos 30 dias (uma semana atípica
--      distorceria a leitura).
--   2. "mais de 5" e "2 a 4" deixavam o 5 exato sem classe. Aqui 5 ou mais é
--      frequente.
--   3. "1 a 3 em 4 meses" deixava de fora quem teve 4 compras em 4 meses sem
--      nenhuma nos últimos 90 dias — eram 2 clientes reais. Sazonal passa a
--      cobrir de 1 a 4.

ALTER TABLE public.vendas_clientes
  ADD COLUMN IF NOT EXISTS frequencia_classe TEXT;

ALTER TABLE public.vendas_clientes DROP CONSTRAINT IF EXISTS vendas_clientes_frequencia_classe_check;
ALTER TABLE public.vendas_clientes ADD CONSTRAINT vendas_clientes_frequencia_classe_check
  CHECK (frequencia_classe IS NULL OR frequencia_classe IN
    ('frequente', 'media', 'baixa', 'sazonal', 'inativo'));

COMMENT ON COLUMN public.vendas_clientes.frequencia_classe IS
  'frequente 5+/mes · media 2-4/mes · baixa 1/mes · sazonal 1-4 nos ultimos 4 meses · inativo sem compra ha 4+ meses. Media mensal apurada sobre os ultimos 90 dias. Não confundir com `status`, que mede o ritmo individual.';

CREATE INDEX IF NOT EXISTS idx_vendas_clientes_frequencia
  ON public.vendas_clientes (frequencia_classe) WHERE frequencia_classe IS NOT NULL;

-- Recalcula junto com o resto, todo dia às 05h.
CREATE OR REPLACE FUNCTION public.recalcular_frequencia_classe()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE afetados integer;
BEGIN
  WITH janela AS (
    SELECT c.id,
           count(*) FILTER (WHERE p.data >= current_date - 90)  AS d90,
           count(*) FILTER (WHERE p.data >= current_date - 120) AS d120,
           max(p.data) AS ultima
      FROM public.vendas_clientes c
      LEFT JOIN public.vendas_pedidos p
        ON p.cliente_id = c.id AND p.eh_valido
     WHERE c.ativo
     GROUP BY c.id
  )
  UPDATE public.vendas_clientes c
     SET frequencia_classe = CASE
           WHEN j.ultima IS NULL OR j.ultima < current_date - 120 THEN 'inativo'
           WHEN j.d90 / 3.0 >= 5 THEN 'frequente'
           WHEN j.d90 / 3.0 >= 2 THEN 'media'
           WHEN j.d90 / 3.0 >= 1 THEN 'baixa'
           ELSE 'sazonal'
         END
    FROM janela j
   WHERE c.id = j.id;

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RETURN afetados;
END $function$;

-- Entra no agendamento diário junto das outras.
SELECT cron.unschedule('recalcular-carteira-vendas');
SELECT cron.schedule(
  'recalcular-carteira-vendas',
  '0 8 * * *',
  $$ select public.recalcular_metricas_vendas();
     select public.recalcular_itens_habituais();
     select public.recalcular_frequencia_classe(); $$
);
