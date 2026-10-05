-- Casquinha no PCP.
--
-- Ela já existia no estoque ("Discos de Casquinhas:", contada 21 vezes, de 200
-- a 350 unidades) mas não existia como PRODUTO, e é a tabela produto que
-- alimenta o planejamento do PCP. Resultado: dava pra contar a casquinha e não
-- dava pra planejar quem ia fazer quantas.
--
-- Entra como 'intermediario', junto da MASSA EMPANADA, e não como produto
-- acabado: acabado é o que vai pra venda, e casquinha nunca foi vendida a
-- cliente nenhum — só abastece a produção das empanadas. Mesma razão pela
-- qual RECHEIO FRANGO não está na aba de acabados.
--
-- Unidade UN porque é assim que ela é contada: 200, 300, 350 discos.
--
-- Sem estoque_seguranca por ora, igual a todos os outros intermediários; o
-- ideal se define na tela de produtos depois de medir o consumo.
insert into produto (nome, categoria, tipo, unidade_producao, rendimento_padrao, ativo)
select 'CASQUINHA', 'MASSA', 'intermediario', 'UN', 1, true
where not exists (
  select 1 from produto where upper(nome) = 'CASQUINHA'
);
