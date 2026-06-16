import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParCandidato } from "./par-candidato";

type Item = {
  id: string;
  codigo_queops: string | null;
  nome: string;
  ativo: boolean;
  mrp_revisado: boolean;
};

// Códigos importados do Queóps na Etapa 2 — usado pra detectar quais foram criados
// por mim e podem ter duplicata existente sem código.
const CODIGOS_IMPORTADOS = [
  "054002", "054008",
  "057018", "057019",
  // 057027, 057033 já consolidados manualmente (PIMENTAO, TOMATE)
  "057039",
  "058016", "058018", "058029", "058033", "058037",
  // 058045 já consolidado (MOLHO DE ALHO)
  "058055", "058056", "058059",
];

// Stopwords pra comparar nomes
const STOPWORDS = new Set([
  "KG", "L", "ML", "UN", "PCT", "PEÇA", "PEC", "BAG", "PACOTE",
  "DE", "DO", "DA", "EM", "COM", "SEM", "GR", "GRS", "G",
  "1", "2", "3", "4", "5", "0", "200", "250", "500", "1000",
  "BDJ", "LITRO", "INTEIRA",
]);

function tokenizar(nome: string): Set<string> {
  return new Set(
    nome
      .toUpperCase()
      .replace(/[^A-ZÀ-Ÿ0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );
}

function similaridade(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comum = 0;
  for (const t of a) if (b.has(t)) comum++;
  return comum / Math.min(a.size, b.size);
}

export default async function RevisarDuplicatasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Pega TODOS os itens ativos pra cruzamento
  const { data: todosItens } = await supabase
    .from("itens")
    .select("id, codigo_queops, nome, ativo, mrp_revisado")
    .eq("ativo", true)
    .order("nome");

  const itens = (todosItens ?? []) as Item[];

  // Itens importados que ainda não foram revisados
  const importados = itens.filter(
    (i) => i.codigo_queops && CODIGOS_IMPORTADOS.includes(i.codigo_queops) && !i.mrp_revisado
  );

  // Pra cada importado, busca candidatos a duplicata (nome similar, código diferente ou null)
  const pares: Array<{ novo: Item; candidatos: Array<{ item: Item; sim: number }> }> = [];

  for (const novo of importados) {
    const tokensNovo = tokenizar(novo.nome);
    const candidatos = itens
      .filter((i) => i.id !== novo.id && !i.mrp_revisado && i.codigo_queops !== novo.codigo_queops)
      .map((i) => ({ item: i, sim: similaridade(tokensNovo, tokenizar(i.nome)) }))
      .filter((c) => c.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);

    if (candidatos.length > 0) {
      pares.push({ novo, candidatos });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Revisar duplicatas</h1>
          <p className="text-sm text-zinc-600">
            Itens que <strong>eu criei</strong> ao importar a planilha do Queóps e podem ser
            duplicatas de itens que <strong>já existiam</strong> em <Link href="/itens" className="text-zinc-900 underline-offset-4 hover:underline">/itens</Link>.
            Você decide caso a caso.
          </p>
        </div>
        <Link href="/mrp/materias-primas" className="text-sm text-zinc-600 hover:underline">
          ← Voltar pra matérias-primas
        </Link>
      </div>

      {pares.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-zinc-500">
            🎉 Nenhuma duplicata pendente de revisão. Todas as consolidações foram feitas.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠ {pares.length} {pares.length === 1 ? "item" : "itens"} com possíveis duplicatas. Pra cada um:
            <strong> consolidar</strong> (vira o item antigo + ganha o código novo, fichas repointadas) ou{" "}
            <strong>marcar como não é duplicata</strong> (some daqui).
          </div>

          <div className="flex flex-col gap-3">
            {pares.map(({ novo, candidatos }) => (
              <ParCandidato
                key={novo.id}
                novo={novo}
                candidatos={candidatos}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
