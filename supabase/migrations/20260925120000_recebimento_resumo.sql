-- A tela de recebimento contava linha por linha, no navegador.
--
-- Ela pedia TODAS as linhas de TODAS as solicitações com status de
-- recebimento — 1.194 hoje — pra depois somar em JavaScript. O PostgREST
-- entrega no máximo 1.000 e corta o resto EM SILÊNCIO: 194 linhas sumiam sem
-- erro nenhum. E como a consulta não tinha ordem, quem era cortado dependia do
-- plano do banco.
--
-- O estrago era invisível e grande: a solicitação de 28/09 a 02/10 aparecia
-- com 24 pendentes e R$ 4.366,80 quando tinha 75 pendentes e R$ 13.294,97.
-- Três das quatro semanas mais recentes estavam erradas, justamente as que
-- ainda importam — as antigas, já recebidas, batiam.
--
-- Somar no banco resolve a causa: a tela passa a ler ~19 linhas em vez de
-- 1.194, e nenhum teto de paginação a alcança.
--
-- recebidos e valor_pendente entram NO FIM: create or replace view não deixa
-- reordenar nem tirar coluna, só acrescentar.
create or replace view solicitacoes_resumo
with (security_invoker = true) as
select
  solicitacao_id,
  count(*)::integer as linhas,
  coalesce(sum(valor), 0::numeric) as valor,
  count(*) filter (
    where status::text = 'Para Aprovar'
       or (status::text = 'Volumes ou Preço Alterados'
           and not coalesce(alteracao_confirmada, false))
  )::integer as pendentes_aprovacao,
  -- Linha alterada só entra no recebimento depois de alguém confirmar a
  -- alteração: até lá o que vai chegar ainda está em discussão.
  count(*) filter (
    where status::text = 'Aprovada'
       or (status::text = 'Volumes ou Preço Alterados'
           and coalesce(alteracao_confirmada, false))
  )::integer as pendentes_recebimento,
  count(*) filter (where status::text = 'Aprovada & Recebida')::integer as recebidos,
  -- Mesma condição de pendentes_recebimento: contagem e valor têm que sair da
  -- mesma régua, senão a tela mostra "24 itens" ao lado de um valor de 75.
  coalesce(sum(valor) filter (
    where status::text = 'Aprovada'
       or (status::text = 'Volumes ou Preço Alterados'
           and coalesce(alteracao_confirmada, false))
  ), 0::numeric) as valor_pendente
from solicitacao_linhas
group by solicitacao_id;

comment on view solicitacoes_resumo is
  'Totais por solicitação. Fonte única de contagem e valor das telas de solicitações e de recebimento — contar linha crua no JS esbarra no teto de 1000 do PostgREST.';
