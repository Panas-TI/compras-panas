# CRM Panas v2 — banco novo

Especificação: https://claude.ai/artifact/RZMNK3dY7koPdiLKaRP5Uu

Estes arquivos **não** ficam em `supabase/migrations/` de propósito: lá vai o que já
está aplicado no banco de produção. Aqui é o banco do CRM novo, que roda primeiro
na homologação (projeto `crm-panas-homologacao`, organização própria da Panas).

Ordem: `01_estrutura` → `02_seguranca` → `03_funis` → `04_motor` →
`05_relatorios` → `06_rotina` → `07_migracao`.

`teste_cenario.sql` simula o uso (clique, clique repetido, desfazer, prospect
novo, telefone repetido, motorista bloqueado, pedido fechando a oportunidade) e
devolve um JSON com o resultado. Rodar dentro de `begin; … rollback;`.

Em 16/10/2026 os sete blocos + o cenário rodaram contra uma cópia viva do banco
de produção numa transação desfeita: 473 contas migradas, 451 de 451 com a mesma
situação do sistema atual, 13 de 13 checagens do cenário passando.
