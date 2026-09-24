-- Reaplica a escada do "não agora" nos contatos adiados pela regra antiga.
--
-- Até hoje "não agora" adiava 14 dias fixos, para todo mundo. A regra nova é
-- 3 / 6 / 12 / 24 conforme quantas vezes seguidas o cliente já respondeu isso
-- (ver diasDoNaoAgora em contato-regras.ts). Sem esta migração os clientes já
-- adiados só voltariam ao longo de outubro, sob uma conta que o sistema não
-- faz mais.
--
-- Só toca o que a MÁQUINA decidiu: prazo de exatamente 14 dias entre o contato
-- e o retorno. Quem tem 4, 7, 8, 15, 18 ou 30 dias teve a data escolhida à mão
-- pelo vendedor — é combinação com o cliente e não se reescreve. Por isso
-- também é segura de rodar duas vezes: depois da primeira nenhuma linha tem
-- mais prazo de 14.
--
-- A trava de 7 dias em vendas_contatos_trava_correcao existe contra reescrita
-- de conversa velha por gente ("passou da janela, foi outra conversa"). Não é
-- o caso aqui: o resultado não muda, só a data que o próprio sistema calculou
-- errado. Desligada dentro da transação e religada na mesma — o carimbo de
-- correção nem seria aceso, o gatilho só o acende quando o resultado muda.
begin;

alter table vendas_contatos disable trigger trg_vendas_contatos_trava_correcao;

with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
seq as (
  select cliente_id, id, resultado, adiar_ate, criado_em,
         row_number() over (partition by cliente_id order by criado_em desc) rn
  from vendas_contatos
  where cliente_id is not null
),
-- Último contato do cliente, ainda silenciando, e adiado pela conta antiga.
alvo as (
  select s.id, s.cliente_id, (s.criado_em at time zone 'America/Sao_Paulo')::date dia
  from seq s
  join vendas_clientes c on c.id = s.cliente_id
  where s.rn = 1
    and s.resultado = 'nao_agora'
    and c.ativo
    and s.adiar_ate > (select d from hoje)
    and s.adiar_ate - (s.criado_em at time zone 'America/Sao_Paulo')::date = 14
),
-- Quantos "não agora" seguidos vieram antes dele: o degrau da escada.
degrau as (
  select a.id, a.dia,
         (select count(*) from seq p
           where p.cliente_id = a.cliente_id
             and p.rn > 1
             and p.rn <= coalesce((select min(x.rn) from seq x
                                    where x.cliente_id = a.cliente_id
                                      and x.rn > 1
                                      and x.resultado <> 'nao_agora'), 999) - 1
             and p.resultado = 'nao_agora') seguidos
  from alvo a
)
update vendas_contatos v
   -- Escada vencida há dias vira "volta hoje", não data no passado: retorno
   -- atrasado entra na tela como promessa quebrada, e promessa nenhuma houve.
   set adiar_ate = greatest(
         d.dia + least(3 * power(2, d.seguidos)::int, 24),
         (select (now() at time zone 'America/Sao_Paulo')::date)
       )
  from degrau d
 where v.id = d.id;

alter table vendas_contatos enable trigger trg_vendas_contatos_trava_correcao;

commit;
