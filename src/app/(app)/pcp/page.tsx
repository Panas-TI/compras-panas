import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PainelPCP, type TurnoPCP } from "./painel";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function porExtenso(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default async function PCPPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
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
  const podePlanejar = ["aprovador", "estoquista"].includes(perfil?.role ?? "");

  const hoje = new Date().toISOString().slice(0, 10);
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;

  const { data: pcp } = await supabase
    .from("pcp_dia")
    .select(
      `id, data, observacoes,
       turnos:pcp_turno(
         id, nome, hora_inicio, hora_fim, ordem,
         equipe:pcp_turno_colaborador(colaborador:colaboradores(nome)),
         linhas:pcp_linha(quantidade, produto:produto(nome))
       )`
    )
    .eq("data", data)
    .maybeSingle();

  const turnos: TurnoPCP[] = (pcp?.turnos ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.hora_inicio.localeCompare(b.hora_inicio))
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      hora_inicio: t.hora_inicio,
      hora_fim: t.hora_fim,
      colaboradores: (t.equipe ?? [])
        .map((e) => e.colaborador?.nome)
        .filter((n): n is string => !!n)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
      linhas: (t.linhas ?? [])
        .map((l) => ({ produto: l.produto?.nome ?? "—", quantidade: Number(l.quantidade) }))
        .sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR")),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/pcp?data=${new Date(new Date(data + "T12:00:00").getTime() - 86400000).toISOString().slice(0, 10)}`}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50"
          >
            ← dia anterior
          </Link>
          {data !== hoje && (
            <Link href="/pcp" className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50">
              hoje
            </Link>
          )}
          <Link
            href={`/pcp?data=${new Date(new Date(data + "T12:00:00").getTime() + 86400000).toISOString().slice(0, 10)}`}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50"
          >
            próximo dia →
          </Link>
        </div>
        {podePlanejar && (
          <Link
            href={`/pcp/planejar?data=${data}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {pcp ? "Editar plano" : "Montar plano do dia"}
          </Link>
        )}
      </div>

      {turnos.length > 0 ? (
        <>
          <PainelPCP turnos={turnos} data={porExtenso(data)} />
          {pcp?.observacoes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4">
              <p className="text-sm font-medium uppercase tracking-wider text-amber-800">Avisos</p>
              <p className="mt-1 text-xl text-amber-900">{pcp.observacoes}</p>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-16 text-center">
            <div className="text-5xl">📋</div>
            <p className="text-2xl font-semibold text-zinc-700">
              Nenhum plano para {porExtenso(data)}
            </p>
            <p className="text-zinc-500">
              {podePlanejar
                ? "Monte o plano do dia para que a produção veja o que fazer."
                : "Aguardando o planejamento do dia."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
