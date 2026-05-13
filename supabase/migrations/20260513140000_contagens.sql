-- Sistema de Contagem de Estoque
-- Templates (pastas) que o estoquista pode importar pra dentro de uma contagem.

CREATE TABLE IF NOT EXISTS public.templates_contagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates_contagem(id) ON DELETE CASCADE,
  ordem INT NOT NULL,
  secao TEXT,
  texto TEXT NOT NULL,
  item_id UUID REFERENCES public.itens(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_template_itens_tpl ON public.template_itens(template_id, ordem);

CREATE TABLE IF NOT EXISTS public.contagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  data_contagem DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_por UUID REFERENCES public.profiles(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizada BOOLEAN NOT NULL DEFAULT false,
  finalizada_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contagens_data ON public.contagens(data_contagem DESC);

CREATE TABLE IF NOT EXISTS public.contagem_linhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id UUID NOT NULL REFERENCES public.contagens(id) ON DELETE CASCADE,
  ordem INT NOT NULL,
  secao TEXT,
  texto TEXT NOT NULL,
  item_id UUID REFERENCES public.itens(id) ON DELETE SET NULL,
  quantidade NUMERIC(14,3),
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contagem_linhas_contagem ON public.contagem_linhas(contagem_id, ordem);

-- atualizado_em
CREATE TRIGGER set_updated_at_contagens BEFORE UPDATE ON public.contagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_contagem_linhas BEFORE UPDATE ON public.contagem_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS
ALTER TABLE public.templates_contagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagem_linhas ENABLE ROW LEVEL SECURITY;

-- Templates: todos leem, só aprovador edita
CREATE POLICY tpl_read ON public.templates_contagem FOR SELECT TO authenticated USING (true);
CREATE POLICY tpl_write ON public.templates_contagem FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

CREATE POLICY tplit_read ON public.template_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY tplit_write ON public.template_itens FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

-- Contagens: todos leem e criam; ambos os perfis podem usar (estoquista pode ser comprador ou aprovador)
CREATE POLICY cont_read ON public.contagens FOR SELECT TO authenticated USING (true);
CREATE POLICY cont_insert ON public.contagens FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador'));
CREATE POLICY cont_update ON public.contagens FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('comprador', 'aprovador'))
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador'));
CREATE POLICY cont_delete ON public.contagens FOR DELETE TO authenticated
  USING (public.current_user_role() = 'aprovador' OR criado_por = auth.uid());

CREATE POLICY contlin_read ON public.contagem_linhas FOR SELECT TO authenticated USING (true);
CREATE POLICY contlin_all ON public.contagem_linhas FOR ALL TO authenticated
  USING (public.current_user_role() IN ('comprador', 'aprovador'))
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador'));
