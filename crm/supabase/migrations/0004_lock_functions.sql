-- CRM · 0004 · Função nova nasce fechada, de verdade
--
-- O 0001 revogava EXECUTE de PUBLIC e anon "in schema public". Não basta: o
-- EXECUTE de PUBLIC em funções é um padrão GLOBAL do Postgres, e uma regra por
-- esquema não consegue tirar o que foi dado globalmente. O verificador de
-- segurança do Supabase mostrou as 16 funções chamáveis sem login. O anon
-- herda de PUBLIC, então revogar só dele também não resolvia.

-- 1. Daqui em diante, globalmente: nenhuma função do postgres nasce pública.
alter default privileges revoke execute on functions from public;

-- 2. As que já existem.
revoke execute on all functions in schema public from public, anon;

-- 3. Só o que a tela chama, e só para quem está logado. As que mudam dado
--    conferem o papel dentro delas (require_role) ou rodam sob RLS (invoker).
grant execute on function
  is_member(uuid), has_role(uuid, text[]), require_role(uuid, text[]), local_today(uuid),
  no_duplicates(smallint[]), nth_open_stage(uuid, integer), outcome_stage(uuid, text),
  followup_days(uuid, integer), create_organization(text, text), move_deal(uuid, uuid, text),
  log_contact(uuid), undo_contact(uuid), create_lead(uuid, text, text, text, text, text),
  run_routine(uuid, text)
to authenticated;

-- 4. As rotinas internas não são chamáveis pela API; rodam pelo run_routine
--    (que confere papel) ou pela rotina noturna do banco.
revoke execute on function recalc_metrics(uuid), generate_repurchase(uuid), generate_reactivation(uuid),
  close_by_orders(uuid), snapshot_status(uuid), run_nightly() from authenticated;

alter function no_duplicates(smallint[]) set search_path = public;

-- 5. Funções de consulta não precisam dos direitos do dono: rodando como quem
--    chama, a RLS garante que ninguém lê etapa, fuso ou regra de outra empresa.
alter function local_today(uuid)             security invoker;
alter function followup_days(uuid, integer)  security invoker;
alter function nth_open_stage(uuid, integer) security invoker;
alter function outcome_stage(uuid, text)     security invoker;
