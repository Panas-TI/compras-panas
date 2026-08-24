-- PCP — Planejamento e Controle da Produção.
--
-- A engenheira monta o plano do dia; a tela é espelhada num monitor na
-- produção pra que as colaboradoras vejam o que fazer, em qual turno e com
-- quem. Por isso o modelo separa TURNO de LINHA: o turno carrega horário e
-- equipe, e cada linha é um produto com quantidade dentro daquele turno.

CREATE TABLE IF NOT EXISTS public.pcp_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  observacoes TEXT,
  criado_por UUID REFERENCES public.profiles(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um plano por dia: dois planos para a mesma data seriam duas verdades.
CREATE UNIQUE INDEX IF NOT EXISTS pcp_dia_data_unica ON public.pcp_dia (data);

CREATE TABLE IF NOT EXISTS public.pcp_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pcp_id UUID NOT NULL REFERENCES public.pcp_dia(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  ordem INT NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pcp_turno_horario_coerente CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_pcp_turno_dia ON public.pcp_turno (pcp_id, ordem);

-- Quem trabalha no turno. Vem do cadastro de colaboradores — é exatamente o
-- uso que ele existe pra servir.
CREATE TABLE IF NOT EXISTS public.pcp_turno_colaborador (
  turno_id UUID NOT NULL REFERENCES public.pcp_turno(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  PRIMARY KEY (turno_id, colaborador_id)
);

CREATE TABLE IF NOT EXISTS public.pcp_linha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID NOT NULL REFERENCES public.pcp_turno(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produto(id),
  quantidade NUMERIC(12,2) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pcp_linha_quantidade_positiva CHECK (quantidade > 0)
);

-- O mesmo produto duas vezes no mesmo turno viraria dois números para a mesma
-- coisa na tela da produção.
CREATE UNIQUE INDEX IF NOT EXISTS pcp_linha_produto_unico
  ON public.pcp_linha (turno_id, produto_id);

CREATE TRIGGER set_updated_at_pcp_dia BEFORE UPDATE ON public.pcp_dia
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Estoque ideal por produto: é a referência que a engenheira usa pra decidir
-- quanto produzir. Vem da planilha do estoquista ("ESTOQUE DE SEGURANÇA").
ALTER TABLE public.produto
  ADD COLUMN IF NOT EXISTS estoque_seguranca NUMERIC(12,2);

COMMENT ON COLUMN public.produto.estoque_seguranca IS
  'Quantidade que se pretende manter em estoque. Referência para o PCP: contagem abaixo disso indica o que produzir.';

ALTER TABLE public.pcp_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcp_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcp_turno_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcp_linha ENABLE ROW LEVEL SECURITY;

-- Leitura ampla: a tela fica num monitor da produção e o estoquista consulta.
-- Escrita restrita a quem planeja.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pcp_dia','pcp_turno','pcp_turno_colaborador','pcp_linha'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_read ON public.%I FOR SELECT USING (auth.uid() IS NOT NULL)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL USING (public.current_user_role() = ANY (ARRAY[''aprovador'',''estoquista''])) WITH CHECK (public.current_user_role() = ANY (ARRAY[''aprovador'',''estoquista'']))',
      t, t);
  END LOOP;
END $$;
