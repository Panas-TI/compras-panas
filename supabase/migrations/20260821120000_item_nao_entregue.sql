-- Item que não veio, e finalização automática da solicitação.
--
-- Faltavam as duas pontas do mesmo problema: o estoquista não tinha como
-- registrar que um item NÃO chegou (a validação exigia quantidade > 0), então
-- a linha ficava pendente pra sempre — e a solicitação ficava presa em
-- "Em recebimento" indefinidamente, porque sempre sobrava linha em aberto.
--
-- 'Aprovada & Recebida' com volume 0 seria mentira: não foi recebida. Daí o
-- status próprio.
ALTER TYPE public.status_linha ADD VALUE IF NOT EXISTS 'Não Entregue';
