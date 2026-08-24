import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { FolhaPCP, type LinhaFolha } from "../folha";
import { AbasPCP } from "../abas";
import type { TipoFolha } from "../actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ data: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function porExtenso(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export default async function FolhaPCPPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { data: dataParam } = await params;
  const sp = await searchParams;
  const tipo: TipoFolha = sp.aba === "recheios" ? "intermediario" : "final";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const podeLancar = ["aprovador", "estoquista"].includes(perfil?.role ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataParam)) redirect("/pcp");
  const data = dataParam;

  const [{ data: turnos }, { data: pcp }] = await Promise.all([
    supabase.from("pcp_turno").select("id, nome, hora_inicio, hora_fim, ordem").eq("ativo", true).order("ordem"),
    supabase
      .from("pcp_dia")
      .select(
        `id, observacoes,
         linhas:pcp_linha(
           id, turno_id, projetado, realizado,
           produto:produto(id, nome, tipo, unidade_producao),
           equipe:pcp_linha_colaborador(colaborador:colaboradores(nome))
         )`
      )
      .eq("data", data)
      .maybeSingle(),
  ]);

  const num = (s: string) => {
    const m = s.match(/^\s*(\d{1,3})\s*[.\s]/);
    return m ? Number(m[1]) : 9999;
  };

  // Ordem do turno vem do cadastro; a folha é lida na sequência do dia e,
  // dentro do turno, na ordem do código que a produção já usa.
  const ordemTurno = new Map((turnos ?? []).map((t) => [t.id, t.ordem]));
  const dadosTurno = new Map((turnos ?? []).map((t) => [t.id, t]));

  const contagem = {
    final: (pcp?.linhas ?? []).filter((l) => l.produto?.tipo === "final").length,
    intermediario: (pcp?.linhas ?? []).filter((l) => l.produto?.tipo === "intermediario").length,
  };

  const linhas: LinhaFolha[] = (pcp?.linhas ?? [])
    .filter((l) => l.produto?.tipo === tipo)
    .map((l) => {
      const t = dadosTurno.get(l.turno_id);
      return {
        linha_id: l.id,
        produto: l.produto?.nome ?? "—",
        projetado: Number(l.projetado),
        realizado: l.realizado === null ? null : Number(l.realizado),
        colaboradores: (l.equipe ?? [])
          .map((e) => e.colaborador?.nome)
          .filter((n): n is string => !!n)
          .sort((a, b) => a.localeCompare(b, "pt-BR")),
        // Cadastro com número no lugar da unidade não vira rótulo: "0,0450"
        // ao lado do nome só confundiria a produção.
        unidade:
          l.produto?.unidade_producao && !/\d/.test(l.produto.unidade_producao)
            ? l.produto.unidade_producao
            : null,
        turno_id: l.turno_id,
        turno_nome: t?.nome ?? "—",
        hora_inicio: t?.hora_inicio ?? "00:00",
        hora_fim: t?.hora_fim ?? "00:00",
        _ordem: ordemTurno.get(l.turno_id) ?? 999,
      };
    })
    .sort(
      (a, b) =>
        a._ordem - b._ordem ||
        num(a.produto) - num(b.produto) ||
        a.produto.localeCompare(b.produto, "pt-BR")
    );

  const temPlano = linhas.length > 0;
  const rotulo = tipo === "final" ? "produtos acabados" : "recheios e massas";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/pcp" className="text-sm text-zinc-600 hover:underline">
          ← Todos os planos
        </Link>
        {podeLancar && (
          <Link
            href={`/pcp/planejar?data=${data}${tipo === "final" ? "" : "&aba=recheios"}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {temPlano ? `Editar ${rotulo}` : `Montar ${rotulo}`}
          </Link>
        )}
      </div>

      <AbasPCP base={`/pcp/${data}`} tipo={tipo} contagem={contagem} />

      {temPlano ? (
        <>
          <FolhaPCP
            data={porExtenso(data)}
            subtitulo={tipo === "final" ? "Plano de produção" : "Recheios e massas"}
            linhas={linhas}
            podeLancar={podeLancar}
            mostrarCodigo={tipo === "final"}
          />
          {pcp?.observacoes && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-800">Avisos</p>
              <p className="mt-0.5 text-xl font-medium text-amber-900">{pcp.observacoes}</p>
            </div>
          )}
          {podeLancar && (
            <p className="text-xs text-zinc-500 print:hidden">
              O campo <strong>Realizado</strong> é editável: digite e saia do campo para salvar.
              Vermelho é abaixo do projetado, verde é acima.
            </p>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-16 text-center">
            <div className="text-5xl">📋</div>
            <p className="text-2xl font-semibold text-zinc-700">
              Nenhuma folha de {rotulo} para {porExtenso(data)}
            </p>
            <p className="text-zinc-500">
              {podeLancar
                ? "Monte a folha para a produção ver o que fazer."
                : "Aguardando o planejamento."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
