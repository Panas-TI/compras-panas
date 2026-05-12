-- =============================================================
-- Sistema de Autorização de Compras — schema inicial
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- PROFILES (extende auth.users)
-- =============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('comprador', 'aprovador')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles(role) WHERE ativo;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND ativo = true LIMIT 1
$$;

-- =============================================================
-- LOOKUPS
-- =============================================================
CREATE TABLE public.classificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.unidades_medida (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.formas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ITENS
-- =============================================================
CREATE TABLE public.itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo_queops TEXT UNIQUE,
  classificacao_id UUID REFERENCES public.classificacoes(id),
  unidade_id UUID REFERENCES public.unidades_medida(id),
  fornecedor_padrao_id UUID REFERENCES public.fornecedores(id),
  preco_referencia NUMERIC(12,4),
  forma_pagto_padrao_id UUID REFERENCES public.formas_pagamento(id),
  prazo_padrao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_itens_nome ON public.itens(nome) WHERE ativo;
CREATE INDEX idx_itens_codigo ON public.itens(codigo_queops) WHERE ativo;
CREATE INDEX idx_itens_nome_lower ON public.itens(LOWER(nome)) WHERE ativo;
CREATE INDEX idx_itens_classif ON public.itens(classificacao_id) WHERE ativo;

-- =============================================================
-- SOLICITAÇÕES SEMANAIS
-- =============================================================
CREATE TABLE public.solicitacoes_semanais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  comprador_id UUID NOT NULL REFERENCES public.profiles(id),
  observacoes TEXT,
  finalizada BOOLEAN NOT NULL DEFAULT false,
  finalizada_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT data_fim_apos_inicio CHECK (data_fim >= data_inicio)
);

CREATE INDEX idx_solicitacoes_inicio ON public.solicitacoes_semanais(data_inicio DESC);
CREATE INDEX idx_solicitacoes_comprador ON public.solicitacoes_semanais(comprador_id);

-- =============================================================
-- LINHAS DE SOLICITAÇÃO
-- =============================================================
CREATE TYPE public.status_linha AS ENUM (
  'Para Aprovar',
  'Aprovada',
  'Aprovada & Recebida',
  'Recusada',
  'Volumes ou Preço Alterados'
);

CREATE TABLE public.solicitacao_linhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes_semanais(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.itens(id),

  -- Snapshot congelado (preenchido na aprovação)
  codigo_queops_congelado TEXT,
  nome_item_congelado TEXT,
  classificacao_congelada TEXT,
  unidade_congelada TEXT,

  -- Dados editáveis da linha
  volume_estoque NUMERIC(12,3),
  volume_solicitado NUMERIC(12,3) NOT NULL DEFAULT 0,
  preco NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor NUMERIC(14,4) GENERATED ALWAYS AS (volume_solicitado * preco) STORED,
  fornecedor_id UUID REFERENCES public.fornecedores(id),
  forma_pagto_id UUID REFERENCES public.formas_pagamento(id),
  prazo TEXT,
  vencimento DATE,
  data_compra DATE,
  data_recebimento DATE,
  status public.status_linha NOT NULL DEFAULT 'Para Aprovar',
  observacoes TEXT,

  aprovado_por UUID REFERENCES public.profiles(id),
  aprovado_em TIMESTAMPTZ,
  recebido_por UUID REFERENCES public.profiles(id),
  recebido_em TIMESTAMPTZ,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_linhas_solicitacao ON public.solicitacao_linhas(solicitacao_id);
CREATE INDEX idx_linhas_status ON public.solicitacao_linhas(status);
CREATE INDEX idx_linhas_item ON public.solicitacao_linhas(item_id);
CREATE INDEX idx_linhas_data_compra ON public.solicitacao_linhas(data_compra) WHERE data_compra IS NOT NULL;

-- =============================================================
-- AUDIT LOG
-- =============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela TEXT NOT NULL,
  registro_id UUID NOT NULL,
  acao TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  changes_json JSONB,
  feito_por UUID REFERENCES public.profiles(id),
  feito_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_registro ON public.audit_log(registro_id, feito_em DESC);
CREATE INDEX idx_audit_feito_por ON public.audit_log(feito_por, feito_em DESC);
CREATE INDEX idx_audit_tabela ON public.audit_log(tabela, feito_em DESC);

-- =============================================================
-- TRIGGERS — auto-criação de profile
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, role, ativo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'comprador',
    false  -- aprovador precisa ativar manualmente
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- TRIGGERS — atualizado_em
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_itens BEFORE UPDATE ON public.itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_solicitacoes BEFORE UPDATE ON public.solicitacoes_semanais
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_linhas BEFORE UPDATE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================
-- TRIGGER — Snapshot + validação Queóps na aprovação
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_linha_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo TEXT;
  v_nome TEXT;
  v_classif TEXT;
  v_unidade TEXT;
BEGIN
  -- Disparo: quando entra num status que requer aprovação E snapshot ainda não foi feito
  IF NEW.status IN ('Aprovada', 'Aprovada & Recebida', 'Volumes ou Preço Alterados')
     AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.codigo_queops_congelado IS NULL) THEN

    SELECT i.codigo_queops, i.nome, c.nome, u.nome
      INTO v_codigo, v_nome, v_classif, v_unidade
      FROM public.itens i
      LEFT JOIN public.classificacoes c ON c.id = i.classificacao_id
      LEFT JOIN public.unidades_medida u ON u.id = i.unidade_id
     WHERE i.id = NEW.item_id;

    IF v_codigo IS NULL OR v_codigo = '' THEN
      RAISE EXCEPTION 'Não é possível aprovar: o item "%" não tem código Queóps cadastrado.', COALESCE(v_nome, '?')
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.codigo_queops_congelado := v_codigo;
    NEW.nome_item_congelado := v_nome;
    NEW.classificacao_congelada := v_classif;
    NEW.unidade_congelada := v_unidade;

    IF NEW.aprovado_em IS NULL THEN
      NEW.aprovado_em := now();
      NEW.aprovado_por := auth.uid();
    END IF;
  END IF;

  -- Marcar recebimento quando vira "Aprovada & Recebida"
  IF NEW.status = 'Aprovada & Recebida' AND OLD.status IS DISTINCT FROM 'Aprovada & Recebida' THEN
    IF NEW.recebido_em IS NULL THEN
      NEW.recebido_em := now();
      NEW.recebido_por := auth.uid();
    END IF;
    IF NEW.data_recebimento IS NULL THEN
      NEW.data_recebimento := CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER linha_approval BEFORE UPDATE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_linha_approval();

-- =============================================================
-- TRIGGER — Atualizar preço de referência do item após aprovação
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_update_preco_ref()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('Aprovada', 'Aprovada & Recebida', 'Volumes ou Preço Alterados')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.preco IS NOT NULL AND NEW.preco > 0 THEN
    UPDATE public.itens
       SET preco_referencia = NEW.preco
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_preco_ref AFTER UPDATE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_preco_ref();

-- =============================================================
-- TRIGGER — Cálculo automático de vencimento
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_calc_vencimento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dias INT;
BEGIN
  IF NEW.data_compra IS NOT NULL AND NEW.prazo IS NOT NULL
     AND NEW.vencimento IS NULL THEN
    -- Aceita "30", "14d", "21D", "7 dias", "30 DIAS"
    IF NEW.prazo ~* '^\s*\d+\s*(d|dias)?\s*$' THEN
      v_dias := (regexp_match(NEW.prazo, '\d+'))[1]::INT;
      NEW.vencimento := NEW.data_compra + v_dias;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calc_vencimento BEFORE INSERT OR UPDATE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_calc_vencimento();

-- =============================================================
-- TRIGGER — Audit log automático
-- =============================================================
CREATE OR REPLACE FUNCTION public.tg_audit_linha()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes JSONB;
  v_acao TEXT;
  v_status_anterior TEXT;
  v_status_novo TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (tabela, registro_id, acao, status_novo, changes_json, feito_por)
    VALUES ('solicitacao_linhas', NEW.id, 'criar', NEW.status::TEXT,
            jsonb_build_object('item_id', NEW.item_id, 'volume_solicitado', NEW.volume_solicitado, 'preco', NEW.preco),
            auth.uid());
    RETURN NEW;
  END IF;

  -- UPDATE: registrar apenas se houve mudança relevante
  v_status_anterior := OLD.status::TEXT;
  v_status_novo := NEW.status::TEXT;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_acao := CASE NEW.status::TEXT
      WHEN 'Aprovada' THEN 'aprovar'
      WHEN 'Aprovada & Recebida' THEN 'receber'
      WHEN 'Recusada' THEN 'recusar'
      WHEN 'Volumes ou Preço Alterados' THEN 'alterar'
      ELSE 'editar'
    END;
  ELSE
    v_acao := 'editar';
  END IF;

  v_changes := jsonb_strip_nulls(jsonb_build_object(
    'volume_estoque',     CASE WHEN OLD.volume_estoque IS DISTINCT FROM NEW.volume_estoque
                               THEN jsonb_build_object('antes', OLD.volume_estoque, 'depois', NEW.volume_estoque) END,
    'volume_solicitado',  CASE WHEN OLD.volume_solicitado IS DISTINCT FROM NEW.volume_solicitado
                               THEN jsonb_build_object('antes', OLD.volume_solicitado, 'depois', NEW.volume_solicitado) END,
    'preco',              CASE WHEN OLD.preco IS DISTINCT FROM NEW.preco
                               THEN jsonb_build_object('antes', OLD.preco, 'depois', NEW.preco) END,
    'fornecedor_id',      CASE WHEN OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                               THEN jsonb_build_object('antes', OLD.fornecedor_id, 'depois', NEW.fornecedor_id) END,
    'forma_pagto_id',     CASE WHEN OLD.forma_pagto_id IS DISTINCT FROM NEW.forma_pagto_id
                               THEN jsonb_build_object('antes', OLD.forma_pagto_id, 'depois', NEW.forma_pagto_id) END,
    'prazo',              CASE WHEN OLD.prazo IS DISTINCT FROM NEW.prazo
                               THEN jsonb_build_object('antes', OLD.prazo, 'depois', NEW.prazo) END,
    'status',             CASE WHEN OLD.status IS DISTINCT FROM NEW.status
                               THEN jsonb_build_object('antes', v_status_anterior, 'depois', v_status_novo) END
  ));

  IF v_changes <> '{}'::JSONB THEN
    INSERT INTO public.audit_log (tabela, registro_id, acao, status_anterior, status_novo, changes_json, feito_por)
    VALUES ('solicitacao_linhas', NEW.id, v_acao, v_status_anterior, v_status_novo, v_changes, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_linha AFTER INSERT OR UPDATE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_linha();

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_semanais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacao_linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_read ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_aprovador_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

-- lookups (read all, write aprovador)
CREATE POLICY classif_read ON public.classificacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY classif_write ON public.classificacoes FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

CREATE POLICY forn_read ON public.fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY forn_write ON public.fornecedores FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

CREATE POLICY unid_read ON public.unidades_medida FOR SELECT TO authenticated USING (true);
CREATE POLICY unid_write ON public.unidades_medida FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

CREATE POLICY pagto_read ON public.formas_pagamento FOR SELECT TO authenticated USING (true);
CREATE POLICY pagto_write ON public.formas_pagamento FOR ALL TO authenticated
  USING (public.current_user_role() = 'aprovador')
  WITH CHECK (public.current_user_role() = 'aprovador');

-- itens (both roles can read/edit; only aprovador can inativar/deletar — but aplicado via app)
CREATE POLICY itens_read ON public.itens FOR SELECT TO authenticated USING (true);
CREATE POLICY itens_write ON public.itens FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador'));
CREATE POLICY itens_update ON public.itens FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('comprador', 'aprovador'))
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador'));

-- solicitacoes (comprador vê só as suas; aprovador vê tudo)
CREATE POLICY solic_read ON public.solicitacoes_semanais FOR SELECT TO authenticated
  USING (public.current_user_role() = 'aprovador' OR comprador_id = auth.uid());
CREATE POLICY solic_insert ON public.solicitacoes_semanais FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('comprador', 'aprovador') AND comprador_id = auth.uid());
CREATE POLICY solic_update ON public.solicitacoes_semanais FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'aprovador' OR comprador_id = auth.uid())
  WITH CHECK (public.current_user_role() = 'aprovador' OR comprador_id = auth.uid());

-- linhas (mesma lógica baseada na solicitação)
CREATE POLICY linhas_read ON public.solicitacao_linhas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (public.current_user_role() = 'aprovador' OR s.comprador_id = auth.uid())
  ));
CREATE POLICY linhas_insert ON public.solicitacao_linhas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (public.current_user_role() = 'aprovador' OR s.comprador_id = auth.uid())
  ));
CREATE POLICY linhas_update ON public.solicitacao_linhas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (public.current_user_role() = 'aprovador' OR s.comprador_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.solicitacoes_semanais s
     WHERE s.id = solicitacao_id
       AND (public.current_user_role() = 'aprovador' OR s.comprador_id = auth.uid())
  ));

-- audit_log (read-only via app — escrita só por triggers SECURITY DEFINER)
CREATE POLICY audit_read ON public.audit_log FOR SELECT TO authenticated
  USING (public.current_user_role() = 'aprovador' OR feito_por = auth.uid());
