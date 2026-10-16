-- cenário de uso, tudo dentro da mesma transação
select set_config('t.uid',  (select id::text from profiles where role = 'aprovador' and coalesce(ativo,true) order by criado_em nulls last limit 1), true);
select set_config('t.mot',  (select id::text from profiles where role = 'motorista' and coalesce(ativo,true) limit 1), true);
select set_config('t.conta',(select conta_id::text from crm_oportunidades where funil_id = 'recompra' and fechada_em is null order by valor desc limit 1), true);
select set_config('t.conta2',(select conta_id::text from crm_oportunidades where funil_id = 'recompra' and fechada_em is null order by valor desc offset 1 limit 1), true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', current_setting('t.uid'), true);

select set_config('t.a1', crm_falei_com_ele(current_setting('t.conta')::uuid)::text, true);
select set_config('t.etapa1', (select e.nome from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id where o.conta_id = current_setting('t.conta')::uuid and o.funil_id='recompra'), true);
select set_config('t.lembrete1', (select (para - crm_hoje())::text from crm_atividades where conta_id = current_setting('t.conta')::uuid and origem='sistema' and status='agendada'), true);
select set_config('t.a2', crm_falei_com_ele(current_setting('t.conta')::uuid)::text, true);
select crm_desfazer_contato(current_setting('t.a1')::uuid);
select set_config('t.etapa_desfeito', (select e.nome from crm_oportunidades o join crm_etapas e on e.id = o.etapa_id where o.conta_id = current_setting('t.conta')::uuid and o.funil_id='recompra'), true);
select set_config('t.contatos_apos_desfazer', (select count(*)::text from crm_atividades where conta_id = current_setting('t.conta')::uuid and origem='pessoa' and status='feita' and (feita_em at time zone 'America/Sao_Paulo')::date = crm_hoje()), true);

select set_config('t.prosp', crm_criar_prospect('Café Teste da Especificação', '51 98888-0001', 'cafeteria', 'indicação', 'poa')::text, true);
select set_config('t.prosp_etapa0', (select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.conta_id = current_setting('t.prosp')::uuid), true);
select crm_falei_com_ele(current_setting('t.prosp')::uuid);
select set_config('t.prosp_etapa1', (select e.nome from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.conta_id = current_setting('t.prosp')::uuid), true);
do $$ begin
  perform crm_criar_prospect('Outro nome', '(51) 98888-0001');
  perform set_config('t.prosp_dup', 'SIM — duplicou', true);
exception when others then
  perform set_config('t.prosp_dup', 'barrado: ' || left(sqlerrm, 80), true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.mot'), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', current_setting('t.mot'), true);
select set_config('t.mot_ve_contas', (select count(*)::text from crm_contas), true);
do $$ begin
  perform crm_falei_com_ele(current_setting('t.conta2')::uuid);
  perform set_config('t.mot_registrou', 'SIM — falhou a trava', true);
exception when others then
  perform set_config('t.mot_registrou', 'barrado: ' || left(sqlerrm, 70), true);
end $$;
reset role;
-- de volta ao sistema: sem sessão, como o cron
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- um pedido já existente fecha a oportunidade: abre uma 90 dias atrás para quem comprou depois
update crm_oportunidades set aberta_em = now() - interval '90 days'
 where conta_id = (select cliente_id from vendas_pedidos where eh_valido and data >= current_date - 30 order by data desc limit 1)
   and fechada_em is null;
select set_config('t.fechou', (select count(*)::text from crm_oportunidades o where o.fechada_em is null and o.aberta_em < now() - interval '80 days'), true);
select crm_rodar('pedidos');

select json_build_object(
  'contas',            (select count(*) from crm_contas),
  'pessoas',           (select count(*) from crm_pessoas),
  'apelidos_erp',      (select count(*) from crm_apelidos_erp),
  'atividades_migradas',(select count(*) from crm_atividades where status='feita'),
  'agendadas_por_pessoa',(select count(*) from crm_atividades where status='agendada' and origem='pessoa'),
  'metricas',          (select json_object_agg(situacao, n) from (select situacao, count(*) n from crm_conta_metricas group by 1) x),
  'situacao_igual_sistema_atual', (select count(*) from crm_conta_metricas m join vendas_clientes v on v.id = m.conta_id where m.situacao = v.status),
  'situacao_diferente',(select count(*) from crm_conta_metricas m join vendas_clientes v on v.id = m.conta_id where m.situacao <> v.status),
  'oportunidades',     (select json_object_agg(funil_id || ' · ' || etapa, n) from (select o.funil_id, e.nome etapa, count(*) n from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id group by 1,2) x),
  'rotinas',           (select json_agg(json_build_object('rotina', rotina, 'status', status, 'linhas', linhas, 'erro', erro) order by id) from crm_rotinas),
  'clique_1_etapa',    current_setting('t.etapa1'),
  'clique_1_lembrete_em_dias', current_setting('t.lembrete1'),
  'clique_repetido_mesmo_id', current_setting('t.a1') = current_setting('t.a2'),
  'desfazer_volta_para', current_setting('t.etapa_desfeito'),
  'contatos_de_hoje_apos_desfazer', current_setting('t.contatos_apos_desfazer'),
  'prospect_nasce_em', current_setting('t.prosp_etapa0'),
  'prospect_apos_contato', current_setting('t.prosp_etapa1'),
  'prospect_telefone_repetido', current_setting('t.prosp_dup'),
  'motorista_ve_contas', current_setting('t.mot_ve_contas'),
  'motorista_registra', current_setting('t.mot_registrou'),
  'pedido_fecha_oportunidade', (select json_build_object('etapa', e.nome, 'pedido', o.pedido_ganho is not null) from crm_oportunidades o join crm_etapas e on e.id=o.etapa_id where o.aberta_em < now() - interval '80 days' limit 1),
  'funil_resumo_linhas', (select count(*) from crm_funil_resumo),
  'placar_semanas',      (select count(*) from crm_placar_semana),
  'previsao',            (select json_object_agg(funil_id, round(previsto)) from crm_previsao_semana),
  'cron',                (select count(*) from cron.job where jobname = 'crm-madrugada'),
  'default_priv_anon',   (select count(*) from pg_default_acl d where d.defaclobjtype = 'f' and array_to_string(d.defaclacl, ',') like '%anon=X%')
) as resultado;
