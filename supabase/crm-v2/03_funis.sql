-- CRM Panas · 03 · Funis e etapas iniciais
-- Probabilidades de partida; recalibrar depois de 8 semanas de conversão medida.

insert into crm_funis (id, nome, ordem, automatico) values
  ('prospeccao', 'Prospecção', 1, false),
  ('recompra',   'Recompra',   2, true),
  ('reativacao', 'Reativação', 3, true);

insert into crm_etapas (funil_id, nome, ordem, tipo, probabilidade, limite_dias, orientacao) values
  ('prospeccao','A contatar',     1,'aberta', 10, 7,  'Apresente a Panas e ofereça degustação.'),
  ('prospeccao','Em conversa',    2,'aberta', 25, 10, 'Descubra quem decide e quanto vende de salgado por semana.'),
  ('prospeccao','Degustação',     3,'aberta', 45, 10, 'Leve os três sabores que mais vendem na rota dele.'),
  ('prospeccao','Proposta',       4,'aberta', 65, 7,  'Mande a tabela e o dia de entrega da rota.'),
  ('prospeccao','Primeiro pedido',5,'ganha', 100, null, null),
  ('prospeccao','Perdido',        6,'perdida', 0, null, null),
  ('recompra',  'Prevista',       1,'aberta', 55, null, 'Ofereça o pedido de sempre e diga quando chega pela rota.'),
  ('recompra',  'Contatada',      2,'aberta', 60, null, 'Ele já recebeu a mensagem. Não repita o mesmo texto.'),
  ('recompra',  'Acompanhando',   3,'aberta', 35, null, 'Mude o argumento: o item que ele parou de levar.'),
  ('recompra',  'Pedido',         4,'ganha', 100, null, null),
  ('recompra',  'Sem pedido',     5,'perdida', 0, null, null),
  ('reativacao','Na fila',        1,'aberta', 10, null, 'Pergunte o que mudou antes de oferecer.'),
  ('reativacao','Contatada',      2,'aberta', 20, null, 'Ofereça o item que ele mais levava.'),
  ('reativacao','Acompanhando',   3,'aberta', 15, null, 'Última tentativa: condição para voltar.'),
  ('reativacao','Recuperado',     4,'ganha', 100, null, null),
  ('reativacao','Descartado',     5,'perdida', 0, null, null);

insert into crm_segmentos (id, nome) values
  ('cafeteria','Cafeteria'), ('padaria','Padaria e confeitaria'),
  ('mercado','Mercado e conveniência'), ('banca','Banca'),
  ('restaurante','Restaurante e bar'), ('posto','Posto de combustível'),
  ('hotel','Hotel'), ('outro','Outro');
