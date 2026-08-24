-- Colaborador não é conta de acesso.
--
-- A versão anterior trazia um vínculo opcional com profiles, e isso fez a tela
-- parecer gestão de login — que não é o propósito. O cadastro existe pra
-- registrar quem trabalha e em que atividades atua; quem tem acesso ao sistema
-- continua sendo assunto exclusivo de Usuários.
--
-- Seguro remover: a tabela está vazia, nenhum vínculo foi criado.
DROP INDEX IF EXISTS public.colaboradores_profile_unico;
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS profile_id;
