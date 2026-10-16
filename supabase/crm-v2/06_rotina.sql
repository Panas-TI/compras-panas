-- CRM Panas · 06 · Rotina diária (05h em Porto Alegre = 08h UTC)
-- A ordem importa: os números primeiro, depois a foto, depois quem pediu
-- fecha, e só então nascem as oportunidades novas.
select cron.schedule('crm-madrugada', '0 8 * * *', $job$
  select crm_rodar('metricas');
  select crm_rodar('foto');
  select crm_rodar('pedidos');
  select crm_rodar('recompra');
  select crm_rodar('reativacao');
$job$);
-- Depois de cada importação do Queóps, a ação da tela roda:
--   crm_rodar('metricas'), crm_rodar('pedidos'), crm_rodar('recompra').
