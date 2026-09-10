-- Correção de contato: a resposta que chega depois.
--
-- Marcar "sem resposta" agendava o retorno pra amanhã e tirava o cliente da
-- lista de hoje. Quando ele respondia duas horas depois não havia onde
-- registrar — o app só sabia inserir. Agora o contato mais recente aceita
-- correção, e estas colunas guardam o que foi dito antes.

alter table public.vendas_contatos
  add column if not exists resultado_inicial text,
  add column if not exists atualizado_em timestamptz;

comment on column public.vendas_contatos.resultado_inicial is
  'Resultado gravado na PRIMEIRA vez. Preenchido só na 1a correção; null = nunca corrigido.';
comment on column public.vendas_contatos.atualizado_em is
  'Quando a resposta tardia do cliente foi registrada por cima do resultado inicial.';

-- Resultado só pode ser um dos cinco conhecidos.
--
-- Não é preciosismo: o cálculo da data de retorno cai em null para resultado
-- desconhecido, e a fila de retorno do plano do dia só enxerga linhas com
-- adiar_ate preenchido. Uma linha nova sem data faria o Map cair num contato
-- ANTIGO do mesmo cliente — um combinado já resolvido voltaria a valer.
alter table public.vendas_contatos
  drop constraint if exists vendas_contatos_resultado_valido;
alter table public.vendas_contatos
  add constraint vendas_contatos_resultado_valido
  check (resultado is null or resultado in
    ('vai_comprar','comprou','nao_agora','sem_resposta','recusou'));

-- As travas da correção moram AQUI, não só no server action.
--
-- A policy de UPDATE é por papel e não tem WITH CHECK, e o módulo Vendas
-- escreve direto do navegador com o token do usuário. Sem isto, qualquer
-- usuário do papel 'vendas' reescreve qualquer contato de qualquer colega —
-- inclusive a data de criação, que é a âncora de todo o histórico.
create or replace function public.vendas_contatos_trava_correcao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.criado_em is distinct from old.criado_em
     or new.cliente_id is distinct from old.cliente_id
     or new.usuario_id is distinct from old.usuario_id then
    raise exception 'Data, cliente e autor de um contato não podem ser alterados.'
      using errcode = 'check_violation';
  end if;

  -- Passou da janela, foi outra conversa: registra-se contato novo.
  if old.criado_em < now() - interval '7 days' then
    raise exception 'Contato com mais de 7 dias não pode ser corrigido. Registre um contato novo.'
      using errcode = 'check_violation';
  end if;

  -- Zerar a data de retorno da linha mais nova é o caminho mais sorrateiro pro
  -- combinado antigo ressuscitar: a fila de retorno só enxerga linhas com
  -- adiar_ate preenchido, então a linha corrigida sai da conta e um contato
  -- ANTIGO do mesmo cliente volta a valer. Nenhum dos 35 contatos existentes
  -- tem essa coluna nula — não é estado legítimo.
  if old.adiar_ate is not null and new.adiar_ate is null then
    raise exception 'A data de retorno não pode ficar em branco numa correção.'
      using errcode = 'check_violation';
  end if;

  -- Corrigir um contato já sucedido por outro deixaria o histórico contando
  -- duas versões da mesma conversa.
  if exists (
    select 1 from public.vendas_contatos v
    where v.cliente_id = old.cliente_id
      and v.criado_em > old.criado_em
  ) then
    raise exception 'Já existe um contato mais novo com este cliente. Corrija aquele.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendas_contatos_trava_correcao on public.vendas_contatos;
create trigger trg_vendas_contatos_trava_correcao
  before update on public.vendas_contatos
  for each row execute function public.vendas_contatos_trava_correcao();
