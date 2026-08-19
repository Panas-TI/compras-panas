-- Munição de venda: o que o cliente parou de comprar.
--
-- 74 mil linhas de itens estavam paradas no banco servindo só pra escrever
-- "Costuma levar: X · Y · Z" no card. O dado mais valioso ali é o inverso: o
-- produto que o cliente comprava com regularidade e deixou de pedir.
--
-- É a diferença entre o vendedor ligar dizendo "faz tempo que você não compra"
-- e ligar dizendo "você levava 4 QUEIJOS toda semana, comprou 182 vezes, e não
-- pede há 19 dias". A segunda tem resposta; a primeira não.
CREATE OR REPLACE FUNCTION public.vendas_oportunidades()
RETURNS TABLE (
  cliente_id UUID,
  produto TEXT,
  vezes INT,
  dias_sem_pedir INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH por_produto AS (
    SELECT p.cliente_id,
           i.produto,
           count(*)::int AS vezes,
           (current_date - max(p.data))::int AS dias_sem_pedir
      FROM public.vendas_pedidos p
      JOIN public.vendas_itens i ON i.pedido = p.pedido
     WHERE p.eh_valido AND i.eh_produto AND p.cliente_id IS NOT NULL
     GROUP BY p.cliente_id, i.produto
  ),
  candidatos AS (
    SELECT pp.*,
           row_number() OVER (PARTITION BY pp.cliente_id ORDER BY pp.vezes DESC) AS rn
      FROM por_produto pp
      JOIN public.vendas_clientes c ON c.id = pp.cliente_id
     WHERE c.intervalo_mediano_dias IS NOT NULL
       -- Hábito de verdade, não compra avulsa.
       AND pp.vezes >= 5
       -- Parou por mais de 3 ciclos: fora da variação normal.
       AND pp.dias_sem_pedir > c.intervalo_mediano_dias * 3
  )
  SELECT cliente_id, produto, vezes, dias_sem_pedir
    FROM candidatos WHERE rn = 1;
$$;

COMMENT ON FUNCTION public.vendas_oportunidades() IS
  'Produto que o cliente comprava com regularidade (5+ vezes) e não pede há mais de 3 ciclos. Um por cliente, o de maior recorrência.';
