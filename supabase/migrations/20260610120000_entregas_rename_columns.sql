-- Renomeia colunas de entregas pra ficar consistente com o resto do banco
-- (criado_em/atualizado_em em PT-BR). A função public.tg_set_updated_at()
-- usa NEW.atualizado_em — sem esse rename, qualquer UPDATE em entregas
-- falhava com "record 'new' has no field 'atualizado_em'".

ALTER TABLE public.entregas RENAME COLUMN created_at TO criado_em;
ALTER TABLE public.entregas RENAME COLUMN updated_at TO atualizado_em;
ALTER TABLE public.entrega_log RENAME COLUMN created_at TO criado_em;
