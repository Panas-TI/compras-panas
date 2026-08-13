/**
 * O PostgREST devolve no máximo 1000 linhas por consulta. Quando a página
 * precisa das linhas cruas pra agregar (relatórios), passar do teto faz o
 * total sair errado *sem nenhum erro aparente* — o pior tipo de bug.
 *
 * Esta função busca em páginas até esgotar. Para telas que só precisam de
 * contagens/somas, prefira agregar no banco (ex.: views *_resumo).
 */
export async function buscarTodas<T>(
  paginar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanhoPagina = 1000
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += tamanhoPagina) {
    const { data, error } = await paginar(de, de + tamanhoPagina - 1);
    if (error || !data?.length) break;
    tudo.push(...data);
    if (data.length < tamanhoPagina) break; // última página
  }
  return tudo;
}
