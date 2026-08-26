-- A empanada é contada nas duas câmaras: o que está congelado e o que está
-- resfriado. São contagens separadas do MESMO produto — o estoque dele é a
-- soma das duas. Por isso o template ganha as 35 duas vezes, em seções
-- diferentes, e a contagem passa a ser lida em páginas.

alter table templates_contagem add column if not exists paginar_por_secao boolean not null default false;
alter table contagens add column if not exists paginar_por_secao boolean not null default false;

comment on column templates_contagem.paginar_por_secao is
  'Quando true, a contagem gerada mostra uma página por seção em vez de tudo numa lista só.';

-- O mesmo produto pode repetir no template, DESDE QUE em seções diferentes —
-- é o caso de um sabor guardado em duas câmaras. O que continua proibido é
-- repetir dentro da mesma seção, que é o erro de digitação de verdade.
drop index if exists template_itens_produto_unico;
drop index if exists template_itens_item_unico;

create unique index template_itens_produto_unico
  on template_itens (template_id, produto_id, coalesce(secao, ''))
  where produto_id is not null;

create unique index template_itens_item_unico
  on template_itens (template_id, item_id, coalesce(secao, ''))
  where item_id is not null;

do $$
declare
  tpl uuid := '689266d7-a156-4cdc-b024-c72f9fead620';
  n int;
begin
  select count(*) into n from template_itens where template_id = tpl;
  if n <> 35 then
    raise exception 'Esperava 35 itens no template de empanadas, achei %. Abortando pra não duplicar em cima de algo já mexido.', n;
  end if;

  update template_itens set secao = 'CÂMARA CONGELADA' where template_id = tpl;

  insert into template_itens (template_id, ordem, secao, texto, item_id, produto_id)
  select template_id, ordem + 35, 'CÂMARA RESFRIADA', texto, item_id, produto_id
  from template_itens
  where template_id = tpl and secao = 'CÂMARA CONGELADA';

  update templates_contagem
     set paginar_por_secao = true,
         descricao = 'Empanadas contadas por câmara: uma página para a congelada, outra para a resfriada. O estoque do sabor é a soma das duas.'
   where id = tpl;
end $$;
