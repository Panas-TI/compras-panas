-- Pivot: cadastro de entrega vira só código de barras.
-- cliente_nome e endereco_rua deixam de ser obrigatórios.
-- data_entrega ganha default CURRENT_DATE pra cadastro rápido.

ALTER TABLE public.entregas ALTER COLUMN cliente_nome DROP NOT NULL;
ALTER TABLE public.entregas ALTER COLUMN endereco_rua DROP NOT NULL;
ALTER TABLE public.entregas ALTER COLUMN data_entrega SET DEFAULT CURRENT_DATE;
