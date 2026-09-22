/**
 * URL pública da foto de um item.
 *
 * O bucket é público de propósito: a foto aparece em lista, e assinar uma URL
 * por linha a cada carregamento deixaria a tela lenta sem proteger nada — é
 * foto de produto, não documento.
 */
export function urlFotoItem(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fotos-itens/${path}`;
}
