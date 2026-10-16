-- CRM Panas · 02 · Segurança
-- Leitura: aprovador, vendas, comprador. Escrita da operação: aprovador e
-- vendas. Configuração (funis, metas, segmentos): só aprovador. Números,
-- histórico e rotinas: só as funções do banco escrevem.

do $$
declare t text;
begin
  foreach t in array array[
    'crm_funis','crm_etapas','crm_segmentos','crm_contas','crm_conta_metricas',
    'crm_pessoas','crm_apelidos_erp','crm_oportunidades','crm_oportunidade_etapas',
    'crm_atividades','crm_notas','crm_metas','crm_situacao_diaria','crm_rotinas']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (public.tem_papel_vendas(array[''aprovador'',''vendas'',''comprador'']))',
      t || '_ler', t);
  end loop;

  foreach t in array array['crm_contas','crm_pessoas','crm_apelidos_erp',
                           'crm_oportunidades','crm_atividades','crm_notas']
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (public.tem_papel_vendas(array[''aprovador'',''vendas'']))
         with check (public.tem_papel_vendas(array[''aprovador'',''vendas'']))',
      t || '_escrever', t);
  end loop;

  foreach t in array array['crm_funis','crm_etapas','crm_segmentos','crm_metas']
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (public.tem_papel_vendas(array[''aprovador'']))
         with check (public.tem_papel_vendas(array[''aprovador'']))',
      t || '_admin', t);
  end loop;
end $$;

-- Função nova nasce fechada. O padrão do Postgres dá EXECUTE a PUBLIC e o do
-- Supabase estende a anon: foi assim que as funções da carteira ficaram
-- chamáveis sem login até 16/10/2026.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
