-- Diferenciar "ainda não classifiquei" de "classifiquei e agendei a volta".
--
-- A bandeja "Aguardando resposta" existe para o contato cujo desfecho ainda não
-- se sabe. Só que concluir com "ainda sem resposta" e uma data de retorno é uma
-- decisão tomada — o cliente não respondeu e fica combinado voltar tal dia. Sem
-- marcar a conclusão, os dois casos ficavam iguais (resultado = sem_resposta) e
-- o cliente continuava na bandeja mesmo já tendo data marcada.
alter table public.vendas_contatos add column if not exists concluido_em timestamptz;

comment on column public.vendas_contatos.concluido_em is
  'Quando alguém fechou o assunto pelo formulário. Null = ainda na bandeja '
  'aguardando resposta. Preenchido, o cliente sai da bandeja e volta pela data '
  'de retorno, como retorno combinado.';

-- Contato já editado pelo formulário antes desta coluna existir já foi
-- concluído: sem isto, todos voltariam para a bandeja.
--
-- O gatilho da correção precisa sair do caminho: ele recusa qualquer UPDATE em
-- contato com mais de 7 dias, e esta linha é manutenção de esquema, não
-- correção de desfecho feita por alguém.
alter table public.vendas_contatos disable trigger trg_vendas_contatos_trava_correcao;

update public.vendas_contatos
set concluido_em = atualizado_em
where concluido_em is null and atualizado_em is not null;

alter table public.vendas_contatos enable trigger trg_vendas_contatos_trava_correcao;
