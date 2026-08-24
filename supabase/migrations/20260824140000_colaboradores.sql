-- Cadastro de colaboradores da empresa.
--
-- Não se confunde com `profiles`, que é conta de LOGIN. A maior parte do time
-- não acessa o sistema — produção, cozinha, entrega — mas precisa estar
-- registrada. E quem acessa pode ser ligado à sua conta pelo campo opcional.
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cargo TEXT,
  setor TEXT,
  telefone TEXT,
  email TEXT,
  data_admissao DATE,
  data_desligamento DATE,
  observacoes TEXT,
  -- Conta de acesso, quando existir. ON DELETE SET NULL: apagar o login não
  -- apaga a pessoa do cadastro.
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.colaboradores IS
  'Pessoas que trabalham na empresa. Diferente de profiles, que é conta de login — a maioria do time não acessa o sistema.';

-- Uma conta de login pertence a uma pessoa só.
CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_profile_unico
  ON public.colaboradores (profile_id) WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo
  ON public.colaboradores (ativo, nome);

-- Desligamento e "ativo" não podem contar histórias diferentes.
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_desligamento_coerente;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_desligamento_coerente
  CHECK (data_desligamento IS NULL OR NOT ativo);

CREATE TRIGGER set_updated_at_colaboradores BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

-- Dado de pessoa: só administrador enxerga e mexe.
DROP POLICY IF EXISTS colaboradores_admin ON public.colaboradores;
CREATE POLICY colaboradores_admin ON public.colaboradores
  FOR ALL USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');
