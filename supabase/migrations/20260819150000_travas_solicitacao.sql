-- Migração B: as invariantes no banco.
--
-- Entra DEPOIS do código corrigido. Na ordem inversa, o envio de contagem
-- passaria a estourar 23505 em produção antes de saber agregar por item.
--
-- Checagem em TypeScript não resolve isto: entre o SELECT e o INSERT cabe outra
-- requisição. Só o índice único garante de verdade.

-- 1) Uma contagem gera no máximo uma solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_uma_por_contagem
  ON public.solicitacoes_semanais (contagem_id) WHERE contagem_id IS NOT NULL;

-- 2) Nunca o mesmo item duas vezes na mesma solicitação.
--    As 10 duplicatas históricas ficam de fora pela flag: o passado segue
--    auditável (3 delas têm entrega registrada) sem impedir a regra de valer.
CREATE UNIQUE INDEX IF NOT EXISTS solicitacao_linhas_item_unico
  ON public.solicitacao_linhas (solicitacao_id, item_id) WHERE NOT duplicata_legada;

-- 3) Uma projeção do MRP também gera no máximo uma solicitação.
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_uma_por_projecao
  ON public.solicitacoes_semanais (projecao_id) WHERE projecao_id IS NOT NULL;

-- 4) O mesmo item não pode entrar duas vezes na mesma pasta de contagem —
--    era daí que vinham os 21 pares repetidos que duplicavam na solicitação.
--    Verificado: hoje há 0 duplicatas, o índice cria limpo.
CREATE UNIQUE INDEX IF NOT EXISTS template_itens_item_unico
  ON public.template_itens (template_id, item_id) WHERE item_id IS NOT NULL;

-- 5) Excluir contagem com linha já enviada deixava a compra órfã na solicitação,
--    sem origem, sem data e sem dono — foi o resíduo de ACEM de 10/08. Agora o
--    banco recusa e manda tratar a solicitação primeiro.
CREATE OR REPLACE FUNCTION public.tg_bloqueia_excluir_contagem_enviada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.contagem_linhas
   WHERE contagem_id = OLD.id AND enviado_em IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'Esta contagem já enviou % linha(s) para solicitação. Excluir deixaria essas compras sem origem. Trate a solicitação primeiro.', n
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_bloqueia_excluir_contagem_enviada ON public.contagens;
CREATE TRIGGER trg_bloqueia_excluir_contagem_enviada
  BEFORE DELETE ON public.contagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_bloqueia_excluir_contagem_enviada();

-- 6) Caminho inverso: apagar a linha da solicitação destravava mal a contagem —
--    enviado_linha_id ia a NULL pela FK, mas enviado_em ficava preenchido e a
--    linha ficava "enviada pro nada", sem poder ser reenviada.
CREATE OR REPLACE FUNCTION public.tg_destrava_contagem_ao_apagar_linha()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.contagem_linhas
     SET enviado_em = NULL, enviado_solicitacao_id = NULL, enviado_linha_id = NULL
   WHERE enviado_linha_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_destrava_contagem_ao_apagar_linha ON public.solicitacao_linhas;
CREATE TRIGGER trg_destrava_contagem_ao_apagar_linha
  BEFORE DELETE ON public.solicitacao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.tg_destrava_contagem_ao_apagar_linha();
