-- CRM Panas · 07 · Migração dos dados atuais
-- Roda uma vez, no dia do corte. Lê as tabelas vendas_* e não apaga nada:
-- elas ficam 30 dias como estão, para voltar atrás se for preciso.

-- 1. Contas: mesmo id do cliente atual, assim os 14 mil pedidos continuam apontando certo.
insert into crm_contas (id, nome, rota, endereco, ciclo_de_vida, dias_contato, ativo, criado_em)
select c.id, c.nome, coalesce(c.rota, 'poa'), c.endereco, 'cliente', c.dias_contato, c.ativo, c.criado_em
  from vendas_clientes c;

-- 2. O telefone que hoje mora no cliente vira a pessoa principal da conta.
--    Sem nome: inventar 'Contato principal' faria a mensagem pronta abrir com "Oi Contato".
insert into crm_pessoas (conta_id, nome, telefone_e164, telefone_presumido, whatsapp, principal)
select c.id, null, c.telefone_e164, coalesce(c.telefone_presumido, false),
       coalesce(c.canal_preferido, 'whatsapp') = 'whatsapp', true
  from vendas_clientes c
 where c.telefone_e164 is not null;

-- 3. Cadastros do Queóps que apontam para cada conta.
insert into crm_apelidos_erp (cadastro_original, conta_id, codigo_queops, conferido)
select a.cadastro_original, a.cliente_id, a.codigo_queops, coalesce(a.reconhecido, false)
  from vendas_cliente_apelidos a;

-- 4. Observação do cadastro vira nota fixada.
insert into crm_notas (conta_id, texto, fixada)
select c.id, trim(c.observacoes), true
  from vendas_clientes c where nullif(trim(c.observacoes), '') is not null;

-- 5. Prospects viram contas em ciclo 'prospect', com o mesmo id, e entram no funil.
insert into crm_contas (id, nome, origem, endereco, bairro, cidade, rota, ciclo_de_vida,
                        responsavel_id, ativo, criado_em)
select p.id, p.nome, p.origem, p.endereco, p.bairro, p.cidade, coalesce(p.rota, 'a_definir'),
       'prospect', p.responsavel_id, p.ativo, p.criado_em
  from vendas_prospects p where p.cliente_id is null;

insert into crm_oportunidades (conta_id, funil_id, etapa_id, titulo, valor, criada_por, responsavel_id, aberta_em)
select p.id, 'prospeccao',
       (select id from crm_etapas where funil_id = 'prospeccao' and ordem = 1),
       'Primeiro pedido', coalesce(p.valor_estimado, 0), 'pessoa', p.responsavel_id, p.criado_em
  from vendas_prospects p where p.cliente_id is null and p.ativo;

-- 6. Histórico de contato vira atividade feita, com o canal e a resposta que tinha.
insert into crm_atividades (conta_id, tipo, status, feita_em, resultado, observacao, origem, usuario_id, criado_em)
select coalesce(k.cliente_id, k.prospect_id),
       case k.canal when 'telefone' then 'ligacao' when 'presencial' then 'visita' else 'whatsapp' end,
       'feita', k.criado_em,
       case k.resultado when 'vai_comprar' then 'vai_pedir' when 'comprou' then 'pediu'
                        when 'nao_agora' then 'nao_agora' when 'recusou' then 'recusou'
                        when 'sem_resposta' then 'sem_resposta' end,
       k.observacao, 'pessoa', k.usuario_id, k.criado_em
  from vendas_contatos k
 where coalesce(k.cliente_id, k.prospect_id) in (select id from crm_contas);

-- 7. Combinado de verdade ainda no futuro vira atividade agendada por pessoa.
insert into crm_atividades (conta_id, tipo, status, para, observacao, origem)
select u.cliente_id, 'whatsapp', 'agendada', u.adiar_ate, u.observacao, 'pessoa'
  from vendas_ultimo_contato u
 where u.combinado_com_cliente and u.adiar_ate >= crm_hoje()
   and u.cliente_id in (select id from crm_contas);

-- 8. Puxados à mão para hoje continuam na lista de hoje.
insert into crm_atividades (conta_id, tipo, status, para, observacao, origem, usuario_id)
select f.cliente_id, 'whatsapp', 'agendada', f.data, f.motivo, 'pessoa', f.criado_por
  from vendas_fila_manual f
 where f.data >= crm_hoje() and f.cliente_id in (select id from crm_contas);

-- 9. Números, foto do dia e as oportunidades de hoje.
select crm_rodar('metricas');
select crm_rodar('foto');
select crm_rodar('recompra');
select crm_rodar('reativacao');
