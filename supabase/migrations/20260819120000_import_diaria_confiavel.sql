-- Importação diária confiável + medição por atendente.
--
-- Com importação semanal, esquecer um dia era raro. Diária, vira rotina — e um
-- dia pulado some para sempre sem ninguém perceber, porque o sistema só olha
-- o que chegou, nunca o que faltou.

-- 1) Quem atendeu cada pedido. O relatório do Queóps já traz isso na coluna
--    "Atend." e a importação estava descartando. É o dado que permite medir
--    quanto cada atendente vendeu, sem inferir nada.
ALTER TABLE public.vendas_pedidos
  ADD COLUMN IF NOT EXISTS atendente TEXT;

COMMENT ON COLUMN public.vendas_pedidos.atendente IS
  'Atendente do pedido, da coluna "Atend." do relatório do Queóps. Normalizado em Maiúscula-inicial na importação: o mesmo Fernando vinha como "fernando" e "Fernando" no mesmo arquivo.';

CREATE INDEX IF NOT EXISTS idx_vendas_pedidos_atendente
  ON public.vendas_pedidos (atendente, data) WHERE atendente IS NOT NULL;

-- 2) Recálculo diário automático.
--    contatar_3dias e status dependem de current_date, mas só eram recalculados
--    quando alguém importava. Num dia sem importação a fila congelava e passava
--    a apontar cliente errado — foi o que fez a fila pular de 56 pra 72 de uma
--    vez quando rodei o recálculo manualmente.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove agendamento anterior antes de recriar (schedule não é idempotente).
DO $$
BEGIN
  PERFORM cron.unschedule('recalcular-carteira-vendas');
EXCEPTION WHEN OTHERS THEN
  NULL; -- não existia ainda
END $$;

-- 08:00 UTC = 05:00 em Brasília, antes de qualquer um abrir a tela.
SELECT cron.schedule(
  'recalcular-carteira-vendas',
  '0 8 * * *',
  $$ select public.recalcular_metricas_vendas(); select public.recalcular_itens_habituais(); $$
);
