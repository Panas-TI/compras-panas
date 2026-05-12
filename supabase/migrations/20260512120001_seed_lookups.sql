-- =============================================================
-- Seed dos lookups (classificações, unidades, formas pagto, fornecedores)
-- =============================================================

INSERT INTO public.classificacoes (nome) VALUES
  ('BEBIDAS'),
  ('CONDIMENTOS'),
  ('CONGELADO'),
  ('CONSERVANTES'),
  ('DESCARTAVEIS'),
  ('EMBALAGENS'),
  ('EMBUTIDOS'),
  ('ENLATADOS'),
  ('FARINHA'),
  ('FARMACIA'),
  ('GORDURA VEGETAL'),
  ('GRAOS'),
  ('HIGIENE'),
  ('HORTI'),
  ('LEITE'),
  ('LIMPEZA'),
  ('MASSA'),
  ('MAT ESCRITORIO'),
  ('MEDIALUNAS'),
  ('PROTEINAS'),
  ('PÃES'),
  ('QUEIJOS'),
  ('RECH DOCES'),
  ('SECOS'),
  ('UNIFORMES')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.unidades_medida (nome) VALUES
  ('KG'),
  ('LITRO'),
  ('UNIDADE'),
  ('CAIXA'),
  ('FARDO'),
  ('PACOTE'),
  ('ROLO'),
  ('BANDEJA'),
  ('BISNAGA'),
  ('BOMBONA'),
  ('GARRAFA'),
  ('MILHEIRO'),
  ('BALDE')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.formas_pagamento (nome) VALUES
  ('BOLETO'),
  ('PIX'),
  ('DINHEIRO'),
  ('CARTÃO VISA'),
  ('CARTÃO ELO'),
  ('CARTÃO NUBANK'),
  ('CARTÃO BRADESCO')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.fornecedores (nome) VALUES
  ('789 ETIQUETAS'),
  ('ADICEL'),
  ('ALVES E SOUSA'),
  ('AMBEV'),
  ('AMK - CENTRALLAC'),
  ('ANS GRAFICA'),
  ('ATACADAO'),
  ('AÇOUGUE LUZ'),
  ('BM UNIFORMES'),
  ('CANTA CLARO'),
  ('DALIA'),
  ('DIEGO'),
  ('EMBAL COLOMBO'),
  ('EMBAL NASCIMENTO'),
  ('ENN EMBALAGENS'),
  ('EXCELSIOR'),
  ('FARMACIA PANVEL/SÃO JOÃO'),
  ('FORMAPLAST'),
  ('G S RIZZI'),
  ('GP SUL'),
  ('HAENSSGEN'),
  ('HORTA E POMAR'),
  ('IMPRESUL'),
  ('MERCOPAN'),
  ('MOREIRA E KEENAN'),
  ('OESA'),
  ('PERTE'),
  ('SDC'),
  ('SEARA'),
  ('TUTTI SECCHI'),
  ('UNIPANI'),
  ('VO NELLY')
ON CONFLICT (nome) DO NOTHING;
