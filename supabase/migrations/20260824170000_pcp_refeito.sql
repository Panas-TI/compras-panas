-- PCP refeito a partir da folha real usada na produção.
--
-- A primeira versão errou em três pontos estruturais:
--   1. Colaborador estava no TURNO. Na folha ele é por LINHA: no mesmo turno,
--      Meri e Hortência fazem empanadas enquanto a Stefanie faz panchos.
--   2. Faltava o REALIZADO. O propósito da folha é comparar o que foi planejado
--      com o que saiu — sem isso ela é só uma lista de tarefas.
--   3. Turno era digitado a cada dia. Na prática são 6 turnos fixos, cadastrados
--      uma vez ("CADASTRO TURNOS" anotado à mão na folha).
--
-- Tabelas antigas continham só dados de teste; recriar é mais limpo que migrar.
DROP TABLE IF EXISTS public.pcp_turno_colaborador CASCADE;
DROP TABLE IF EXISTS public.pcp_linha CASCADE;
DROP TABLE IF EXISTS public.pcp_turno CASCADE;

-- Turnos: cadastro, não digitação diária.
CREATE TABLE IF NOT EXISTS public.pcp_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  ordem INT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pcp_turno_horario_coerente CHECK (hora_fim > hora_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS pcp_turno_ordem_unica ON public.pcp_turno (ordem) WHERE ativo;

-- Linha = um produto, num turno, de um dia.
CREATE TABLE IF NOT EXISTS public.pcp_linha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pcp_id UUID NOT NULL REFERENCES public.pcp_dia(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL REFERENCES public.pcp_turno(id) ON DELETE RESTRICT,
  produto_id UUID NOT NULL REFERENCES public.produto(id) ON DELETE RESTRICT,
  projetado NUMERIC(12,2) NOT NULL CHECK (projetado > 0),
  -- Nulo enquanto o turno não fecha. Zero é resposta válida: nada foi feito.
  realizado NUMERIC(12,2) CHECK (realizado IS NULL OR realizado >= 0),
  observacao TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Duas linhas do mesmo produto no mesmo turno virariam dois números pra mesma
-- coisa na folha.
CREATE UNIQUE INDEX IF NOT EXISTS pcp_linha_unica
  ON public.pcp_linha (pcp_id, turno_id, produto_id);
CREATE INDEX IF NOT EXISTS idx_pcp_linha_dia ON public.pcp_linha (pcp_id);

-- Quem produziu AQUELA linha — não o turno inteiro.
CREATE TABLE IF NOT EXISTS public.pcp_linha_colaborador (
  linha_id UUID NOT NULL REFERENCES public.pcp_linha(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  PRIMARY KEY (linha_id, colaborador_id)
);

CREATE TRIGGER set_updated_at_pcp_linha BEFORE UPDATE ON public.pcp_linha
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.pcp_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcp_linha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcp_linha_colaborador ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pcp_turno','pcp_linha','pcp_linha_colaborador'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT USING (auth.uid() IS NOT NULL)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL USING (public.current_user_role() = ANY (ARRAY[''aprovador'',''estoquista''])) WITH CHECK (public.current_user_role() = ANY (ARRAY[''aprovador'',''estoquista'']))',
      t, t);
  END LOOP;
END $$;

-- Os 6 turnos anotados à mão na folha.
INSERT INTO public.pcp_turno (nome, hora_inicio, hora_fim, ordem) VALUES
  ('1º turno', '08:15', '09:15', 1),
  ('2º turno', '09:30', '10:30', 2),
  ('3º turno', '10:45', '11:45', 3),
  ('4º turno', '12:00', '13:00', 4),
  ('5º turno', '14:15', '15:15', 5),
  ('6º turno', '15:30', '16:30', 6)
ON CONFLICT DO NOTHING;
