-- RPC: aprovar em massa todas as linhas elegíveis de uma solicitação.
-- Linhas sem código Queóps são puladas (trigger bloqueia, capturamos a exceção).

CREATE OR REPLACE FUNCTION public.bulk_aprovar(p_solic_id UUID)
RETURNS TABLE (aprovadas INT, pulados_sem_codigo INT, erros INT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_aprovadas INT := 0;
  v_pulados INT := 0;
  v_erros INT := 0;
  v_linha RECORD;
BEGIN
  -- Garante que só aprovador pode chamar
  IF current_user_role() <> 'aprovador' THEN
    RAISE EXCEPTION 'Apenas usuários aprovador podem aprovar em massa.';
  END IF;

  FOR v_linha IN
    SELECT id FROM public.solicitacao_linhas
    WHERE solicitacao_id = p_solic_id AND status = 'Para Aprovar'
  LOOP
    BEGIN
      UPDATE public.solicitacao_linhas
         SET status = 'Aprovada'
       WHERE id = v_linha.id;
      v_aprovadas := v_aprovadas + 1;
    EXCEPTION
      WHEN check_violation THEN
        v_pulados := v_pulados + 1;
      WHEN OTHERS THEN
        v_erros := v_erros + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_aprovadas, v_pulados, v_erros;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_aprovar(UUID) TO authenticated;
