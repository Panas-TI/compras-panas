import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorPlano, type ColabOpt, type ProdutoOpt, type TurnoOpt } from "./editor";
import type { TipoFolha } from "../actions";
import { AbasPCP } from "../abas";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlanejarPage({ searchParams }: { searchParams: SearchParams }) {
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
  if (!perfil?.ativo || !["aprovador", "estoquista", "gestor_producao"].includes(perfil.role)) redirect("/pcp");

  const hoje = new Date().toISOString().slice(0, 10);
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;
  // Duas folhas no mesmo dia: o que vai pra venda e o que abastece a produção.
  const tipo: TipoFolha = sp.aba === "recheios" ? "intermediario" : "final";

  const [{ data: turnos }, { data: produtos }, { data: colabs }, { data: pcp }, { data: ultima }] =
    await Promise.all([
      supabase.from("pcp_turno").select("id, nome, hora_inicio, hora_fim").eq("ativo", true).order("ordem"),
      supabase
        .from("produto")
        .select("id, nome, estoque_seguranca, unidade_producao")
        .eq("ativo", true)
        .eq("tipo", tipo)
        .order("nome"),
      supabase.from("colaboradores").select("id, nome").eq("ativo", true).order("nome"),
      supabase
        .from("pcp_dia")
        .select(
          `id, observacoes,
           linhas:pcp_linha(turno_id, produto_id, projetado,
             produto:produto(tipo),
             equipe:pcp_linha_colaborador(colaborador_id))`
        )
        .eq("data", data)
        .maybeSingle(),
      supabase
        .from("contagens")
        .select("id")
        .eq("finalizada", true)
        .order("data_contagem", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Quanto tem hoje, da última contagem finalizada — é o que sustenta a decisão
  // de quanto produzir.
  const contado = new Map<string, number>();
  if (ultima?.id) {
    const { data: linhas } = await supabase
      .from("contagem_linhas")
      .select("produto_id, quantidade")
      .eq("contagem_id", ultima.id)
      .not("produto_id", "is", null);
    for (const l of linhas ?? []) {
      if (l.produto_id && l.quantidade != null) contado.set(l.produto_id, Number(l.quantidade));
    }
  }

  const opcoes: ProdutoOpt[] = (produtos ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    estoque_seguranca: p.estoque_seguranca != null ? Number(p.estoque_seguranca) : null,
    contado: contado.get(p.id) ?? null,
    // Alguns cadastros trouxeram número no lugar da unidade; nesse caso é
    // melhor não mostrar nada do que mostrar "0,0450" como se fosse unidade.
    unidade: p.unidade_producao && !/\d/.test(p.unidade_producao) ? p.unidade_producao : null,
  }));

  const grade: Record<string, Record<string, { qtd: string; colabs: string[] }>> = {};
  const produtosIniciais: string[] = [];
  for (const l of (pcp?.linhas ?? []).filter((l) => l.produto?.tipo === tipo)) {
    if (!produtosIniciais.includes(l.produto_id)) produtosIniciais.push(l.produto_id);
    grade[l.produto_id] = grade[l.produto_id] ?? {};
    grade[l.produto_id][l.turno_id] = {
      qtd: String(Number(l.projetado)),
      colabs: (l.equipe ?? []).map((e) => e.colaborador_id),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/pcp/${data}${tipo === "final" ? "" : "?aba=recheios"}`}
          className="text-sm text-zinc-600 hover:underline"
        >
          ← Folha da produção
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          Planejar {tipo === "final" ? "produtos acabados" : "recheios e massas"}
        </h1>
        <p className="text-sm text-zinc-600">
          {tipo === "final"
            ? "Produtos nas linhas, turnos nas colunas. Em cada cruzamento, quanto produzir e quem faz."
            : "O que abastece a produção: recheios, massas e preparos. Quantidades em peso ou volume."}
        </p>
      </div>

      <AbasPCP base={`/pcp/planejar?data=${data}`} tipo={tipo} />

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2">
        <form method="get" className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-700">Data</label>
          <input type="date" name="data" defaultValue={data} className="h-9 rounded-md border border-zinc-300 px-2 text-sm" />
          <button className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50">Trocar</button>
        </form>
        <span className="ml-auto text-xs text-zinc-500">
          {ultima?.id ? "Comparando com a última contagem finalizada" : "Sem contagem finalizada para comparar"}
        </span>
      </div>

      <EditorPlano
        data={data}
        turnos={(turnos ?? []) as TurnoOpt[]}
        produtos={opcoes}
        colaboradores={(colabs ?? []) as ColabOpt[]}
        gradeInicial={grade}
        produtosIniciais={produtosIniciais}
        obsInicial={pcp?.observacoes ?? ""}
        tipo={tipo}
      />
    </div>
  );
}
