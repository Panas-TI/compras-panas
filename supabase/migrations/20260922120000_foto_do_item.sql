-- Foto no cadastro do item.
--
-- Quem conta estoque e quem compra nem sempre reconhece o item pelo nome:
-- "ACEM", "LOMBO CANADENSE" e "REQUEIJÃO CATUPIRY BISNAGA 1,8kg" são óbvios
-- pra quem lida todo dia e opacos pra quem está começando. A foto resolve isso
-- na hora da conferência, sem precisar perguntar pra alguém.
alter table public.itens add column if not exists foto_path text;

comment on column public.itens.foto_path is
  'Caminho do arquivo no bucket fotos-itens. Null = sem foto. A URL pública é '
  'montada a partir daqui; o bucket é público para leitura porque a foto '
  'aparece em lista e assinar URL a cada render deixaria a tela lenta.';

-- Gravar é restrito a quem administra o catálogo. Ler não precisa de política:
-- o bucket é público, como a foto de um produto deve ser.
drop policy if exists fotos_itens_insert on storage.objects;
create policy fotos_itens_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-itens'
    and current_user_role() = any (array['aprovador', 'comprador', 'gestor_producao'])
  );

drop policy if exists fotos_itens_update on storage.objects;
create policy fotos_itens_update on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos-itens'
    and current_user_role() = any (array['aprovador', 'comprador', 'gestor_producao'])
  );

drop policy if exists fotos_itens_delete on storage.objects;
create policy fotos_itens_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-itens'
    and current_user_role() = any (array['aprovador', 'comprador', 'gestor_producao'])
  );
