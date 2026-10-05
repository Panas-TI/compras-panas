import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TabelaProdutos, type ProdutoLinha } from "./tabela-produtos";

export const dynamic = "force-dynamic";

const PODEM_LER = ["aprovador", "comprador", "estoquista", "gestor_producao", "financeiro"];
const PODEM_ESCREVER = ["aprovador", "comprador", "gestor_producao"];

/**
 * Cadastro dos produtos que o PCP planeja.
 *
 * Existia tudo pra planejar produção e nada pra cadastrar o que se produz:
 * criar um produto novo exigia alguém mexer no banco. Foi o que aconteceu com
 * a casquinha — contada no estoque há meses, impossível de planejar.
 */
export default async function ProdutosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || !PODEM_LER.includes(perfil.role)) redirect("/cadastros");

  const { data: rows } = await supabase
    .from("produto")
    .select("id, nome, tipo, categoria, unidade_producao, estoque_seguranca, ativo")
    .order("tipo")
    .order("categoria")
    .order("nome");

  const linhas: ProdutoLinha[] = (rows ?? []).map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    categoria: r.categoria,
    unidade_producao: r.unidade_producao,
    estoque_seguranca: r.estoque_seguranca != null ? Number(r.estoque_seguranca) : null,
    ativo: r.ativo,
  }));

  // Categorias que já existem viram as opções do formulário: sem isso cada
  // cadastro inventa a sua ("MASSAS", "Massa", "massa") e o agrupamento do PCP
  // vira confete.
  const categorias = Array.from(new Set(linhas.map((l) => l.categoria))).sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-zinc-600">
            O que a produção faz. É esta lista que aparece no PCP para planejar os turnos.
          </p>
        </div>
        <Link href="/cadastros" className="text-sm text-zinc-600 hover:underline">
          ← Voltar
        </Link>
      </div>
      <TabelaProdutos
        linhas={linhas}
        categorias={categorias}
        podeEscrever={PODEM_ESCREVER.includes(perfil.role)}
      />
    </div>
  );
}
