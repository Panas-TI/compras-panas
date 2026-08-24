import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorPCP, type ColabOpt, type ProdutoOpt } from "./editor";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlanejarPCPPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
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
  if (!perfil?.ativo || !["aprovador", "estoquista"].includes(perfil.role)) redirect("/pcp");

  const hoje = new Date().toISOString().slice(0, 10);
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;

  const [{ data: produtos }, { data: colabs }, { data: pcp }, { data: ultimaContagem }] =
    await Promise.all([
      supabase
        .from("produto")
        .select("id, nome, estoque_seguranca")
        .eq("ativo", true)
        .eq("tipo", "final")
        .order("nome"),
      supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
      supabase
        .from("pcp_dia")
        .select(
          `id, observacoes,
           turnos:pcp_turno(
             id, nome, hora_inicio, hora_fim, ordem,
             equipe:pcp_turno_colaborador(colaborador_id),
             linhas:pcp_linha(produto_id, quantidade)
           )`
        )
        .eq("data", data)
        .maybeSingle(),
      // Última contagem finalizada: dá o "quanto tem hoje" ao lado do ideal.
      supabase
        .from("contagens")
        .select("id")
        .eq("finalizada", true)
        .order("data_contagem", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const contado = new Map<string, number>();
  if (ultimaContagem?.id) {
    const { data: linhas } = await supabase
      .from("contagem_linhas")
      .select("produto_id, quantidade")
      .eq("contagem_id", ultimaContagem.id)
      .not("produto_id", "is", null);
    for (const l of linhas ?? []) {
      if (l.produto_id && l.quantidade != null) {
        contado.set(l.produto_id, Number(l.quantidade));
      }
    }
  }

  const opcoes: ProdutoOpt[] = (produtos ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    estoque_seguranca: p.estoque_seguranca != null ? Number(p.estoque_seguranca) : null,
    contado: contado.get(p.id) ?? null,
  }));

  const inicial =
    pcp?.turnos && pcp.turnos.length > 0
      ? pcp.turnos
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((t) => ({
            _k: t.id,
            nome: t.nome,
            hora_inicio: t.hora_inicio.slice(0, 5),
            hora_fim: t.hora_fim.slice(0, 5),
            colaboradores: (t.equipe ?? []).map((e) => e.colaborador_id),
            linhas: (t.linhas ?? []).map((l, i) => ({
              _k: `${t.id}-${i}`,
              produto_id: l.produto_id,
              quantidade: String(Number(l.quantidade)),
            })),
          }))
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/pcp?data=${data}`} className="text-sm text-zinc-600 hover:underline">
          ← Painel da produção
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Planejar produção</h1>
        <p className="text-sm text-zinc-600">
          Defina os turnos, quem produz e o quanto. O painel da produção mostra isso em tempo real,
          destacando o turno corrente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
        <label className="text-sm font-medium text-zinc-700">Data do plano</label>
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="data"
            defaultValue={data}
            className="h-9 rounded-md border border-zinc-300 px-2 text-sm"
          />
          <button className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50">
            Trocar
          </button>
        </form>
        {ultimaContagem?.id && (
          <span className="ml-auto text-xs text-zinc-500">
            Comparando com a última contagem finalizada
          </span>
        )}
      </div>

      <EditorPCP
        data={data}
        produtos={opcoes}
        colaboradores={(colabs ?? []) as ColabOpt[]}
        inicial={inicial}
        obsInicial={pcp?.observacoes ?? ""}
      />
    </div>
  );
}
