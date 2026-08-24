-- Papel "gestor_producao": acesso total ao módulo Estoque.
--
-- Diferente do estoquista, que só recebe e conta, o gestor de produção manda
-- em tudo o que é estoque — solicitação, contagem, recebimento, PCP, itens,
-- MRP, cadastros e relatórios. Fora do módulo Estoque não entra: usuários,
-- entregas e vendas continuam de fora.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('comprador','aprovador','estoquista','motorista','vendas','financeiro','gestor_producao'));

-- ── Contagem ────────────────────────────────────────────────────────────────
alter policy contlin_all on contagem_linhas
  using (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']));

alter policy cont_insert on contagens
  with check (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']));

alter policy cont_update on contagens
  using (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']));

alter policy cont_delete on contagens
  using (current_user_role() = any (array['aprovador','gestor_producao']) or criado_por = auth.uid());

-- ── Recebimento ─────────────────────────────────────────────────────────────
alter policy receb_entregas_all on recebimento_entregas
  using (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['comprador','aprovador','estoquista','gestor_producao']));

-- ── Solicitações ────────────────────────────────────────────────────────────
alter policy solic_read on solicitacoes_semanais
  using (current_user_role() = any (array['aprovador','estoquista','gestor_producao'])
         or comprador_id = auth.uid());

alter policy solic_insert on solicitacoes_semanais
  with check (current_user_role() = any (array['comprador','aprovador','gestor_producao'])
              and comprador_id = auth.uid());

alter policy solic_update on solicitacoes_semanais
  using (current_user_role() = any (array['aprovador','gestor_producao']) or comprador_id = auth.uid())
  with check (current_user_role() = any (array['aprovador','gestor_producao']) or comprador_id = auth.uid());

alter policy solic_delete on solicitacoes_semanais
  using (current_user_role() = any (array['aprovador','gestor_producao']) or comprador_id = auth.uid());

alter policy linhas_read on solicitacao_linhas
  using (exists (select 1 from solicitacoes_semanais s
                 where s.id = solicitacao_linhas.solicitacao_id
                   and (current_user_role() = any (array['aprovador','estoquista','financeiro','gestor_producao'])
                        or s.comprador_id = auth.uid())));

alter policy linhas_insert on solicitacao_linhas
  with check (exists (select 1 from solicitacoes_semanais s
                      where s.id = solicitacao_linhas.solicitacao_id
                        and (current_user_role() = any (array['aprovador','gestor_producao'])
                             or s.comprador_id = auth.uid())));

alter policy linhas_update on solicitacao_linhas
  using (exists (select 1 from solicitacoes_semanais s
                 where s.id = solicitacao_linhas.solicitacao_id
                   and (current_user_role() = any (array['aprovador','estoquista','financeiro','gestor_producao'])
                        or s.comprador_id = auth.uid())));

alter policy linhas_delete on solicitacao_linhas
  using (exists (select 1 from solicitacoes_semanais s
                 where s.id = solicitacao_linhas.solicitacao_id
                   and (current_user_role() = any (array['aprovador','gestor_producao'])
                        or s.comprador_id = auth.uid())));

-- ── Itens e cadastros ───────────────────────────────────────────────────────
alter policy itens_write on itens
  with check (current_user_role() = any (array['comprador','aprovador','gestor_producao']));
alter policy itens_update on itens
  using (current_user_role() = any (array['comprador','aprovador','gestor_producao']))
  with check (current_user_role() = any (array['comprador','aprovador','gestor_producao']));

alter policy classif_write on classificacoes
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));
alter policy forn_write on fornecedores
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));
alter policy pagto_write on formas_pagamento
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));
alter policy unid_write on unidades_medida
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));
alter policy tpl_write on templates_contagem
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));
alter policy tplit_write on template_itens
  using (current_user_role() = any (array['aprovador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','gestor_producao']));

-- ── Produto, fichas e MRP ───────────────────────────────────────────────────
alter policy produto_all on produto
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));

alter policy ficha_all on ficha_tecnica
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));
alter policy ficha_item_all on ficha_item
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));

alter policy projecao_all on projecao_producao
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));
alter policy projecao_demanda_all on projecao_demanda
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));
alter policy projecao_necessidade_all on projecao_necessidade
  using (current_user_role() = any (array['aprovador','comprador','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','comprador','gestor_producao']));

-- ── PCP ─────────────────────────────────────────────────────────────────────
alter policy pcp_dia_write on pcp_dia
  using (current_user_role() = any (array['aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','estoquista','gestor_producao']));
alter policy pcp_linha_write on pcp_linha
  using (current_user_role() = any (array['aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','estoquista','gestor_producao']));
alter policy pcp_linha_colaborador_write on pcp_linha_colaborador
  using (current_user_role() = any (array['aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','estoquista','gestor_producao']));
alter policy pcp_turno_write on pcp_turno
  using (current_user_role() = any (array['aprovador','estoquista','gestor_producao']))
  with check (current_user_role() = any (array['aprovador','estoquista','gestor_producao']));

-- ── Leituras que faltavam ───────────────────────────────────────────────────
-- `produto` e `colaboradores` só tinham política de aprovador/comprador. Sem
-- SELECT, a folha do PCP saía com o nome do produto e do colaborador em
-- branco pra quem não fosse admin — o estoquista já sofria disso hoje.
create policy produto_read on produto for select
  using (current_user_role() = any (array['aprovador','comprador','estoquista','gestor_producao','financeiro']));

create policy colaboradores_read on colaboradores for select
  using (current_user_role() = any (array['aprovador','comprador','estoquista','gestor_producao']));
