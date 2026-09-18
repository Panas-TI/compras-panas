-- Trocar o canal ou completar a observação não é "correção".
--
-- O fluxo virou: um clique registra o contato como "ainda sem resposta", e a
-- classificação (canal, resultado, motivo) acontece depois, na bandeja. Com o
-- gatilho carimbando qualquer UPDATE, escolher o canal marcava o registro como
-- corrigido e o histórico mostrava "antes: Ainda sem resposta" sem que nada
-- tivesse sido corrigido de fato.

CREATE OR REPLACE FUNCTION public.vendas_contatos_trava_correcao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- Data de retorno absurda esconde o cliente PARA SEMPRE: o plano do dia
  -- silencia quem tem adiar_ate >= hoje e só devolve à fila quando a data
  -- vence. Um dedo escorregando no ano ("31/12/9999") apaga o cliente de todas
  -- as telas sem erro nenhum. Um ano à frente já cobre qualquer combinado real.
  if new.adiar_ate is not null and new.adiar_ate > current_date + interval '365 days' then
    raise exception 'Data de retorno longe demais (máximo um ano).'
      using errcode = 'check_violation';
  end if;

  -- O rastro da correção é gravado AQUI, não pelo chamador.
  --
  -- Quem escreve direto no PostgREST poderia mandar atualizado_em = null e
  -- apagar o selo "corrigido" das telas, ou forjar resultado_inicial para
  -- esconder o que tinha sido dito antes. Carimbando no banco, o rastro existe
  -- por qualquer caminho — e resultado_inicial só é preenchido na primeira
  -- correção, senão a segunda apagaria a original.
  -- Só carimba quando o RESULTADO muda. Classificar o canal ou completar a
  -- observação depois faz parte do mesmo contato, não é correção: marcar essas
  -- edições como "corrigido — antes: Ainda sem resposta" encheria o histórico
  -- de selo falso e faria a taxa de recuperação contar o que não aconteceu.
  if new.resultado is distinct from old.resultado then
    new.atualizado_em := now();
    new.resultado_inicial := coalesce(old.resultado_inicial, old.resultado);
    new.corrigido_por := coalesce(auth.uid(), new.corrigido_por);
  else
    -- Mantém o rastro que já existia; o chamador não pode apagá-lo.
    new.atualizado_em := old.atualizado_em;
    new.resultado_inicial := old.resultado_inicial;
    new.corrigido_por := old.corrigido_por;
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
$function$

