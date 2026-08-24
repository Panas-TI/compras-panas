import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { FolhaPCP, type LinhaProduto, type TurnoCol } from "./folha";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function porExtenso(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
const somaDias = (iso: string, n: number) =>
  new Date(new Date(iso + "T12:00:00").getTime() + n * 86400000).toISOString().slice(0, 10);

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
  const podeLancar = ["aprovador", "estoquista"].includes(perfil?.role ?? "");

  const hoje = new Date().toISOString().slice(0, 10);
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;

  const [{ data: turnos }, { data: pcp }] = await Promise.all([
    supabase.from("pcp_turno").select("id, nome, hora_inicio, hora_fim, ordem").eq("ativo", true).order("ordem"),
    supabase
      .from("pcp_dia")
      .select(
        `id, observacoes,
         linhas:pcp_linha(
           id, turno_id, projetado, realizado,
           produto:produto(id, nome),
           equipe:pcp_linha_colaborador(colaborador:colaboradores(nome))
         )`
      )
      .eq("data", data)
      .maybeSingle(),
  ]);

  // Só mostra as colunas de turno que têm produção planejada — seis colunas
  // vazias numa tela de parede só atrapalham a leitura.
  const turnosComPlano = new Set((pcp?.linhas ?? []).map((l) => l.turno_id));
  const colunas: TurnoCol[] = (turnos ?? [])
    .filter((t) => turnosComPlano.has(t.id))
    .map((t) => ({ id: t.id, nome: t.nome, hora_inicio: t.hora_inicio, hora_fim: t.hora_fim }));

  // Agrupa por produto, mantendo a ordem do código.
  const porProduto = new Map<string, LinhaProduto>();
  for (const l of pcp?.linhas ?? []) {
    const nome = l.produto?.nome ?? "—";
    const pid = l.produto?.id ?? l.id;
    let alvo = porProduto.get(pid);
    if (!alvo) {
      alvo = { produto_id: pid, produto: nome, celulas: {} };
      porProduto.set(pid, alvo);
    }
    alvo.celulas[l.turno_id] = {
      linha_id: l.id,
      projetado: Number(l.projetado),
      realizado: l.realizado === null ? null : Number(l.realizado),
      colaboradores: (l.equipe ?? [])
        .map((e) => e.colaborador?.nome)
        .filter((n): n is string => !!n)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }

  const num = (s: string) => {
    const m = s.match(/^\s*(\d{1,3})\s*[.\s]/);
    return m ? Number(m[1]) : 9999;
  };
  const linhas = Array.from(porProduto.values()).sort(
    (a, b) => num(a.produto) - num(b.produto) || a.produto.localeCompare(b.produto, "pt-BR")
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/pcp?data=${somaDias(data, -1)}`} className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50">
            ← anterior
          </Link>
          {data !== hoje && (
            <Link href="/pcp" className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50">
              hoje
            </Link>
          )}
          <Link href={`/pcp?data=${somaDias(data, 1)}`} className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 hover:bg-zinc-50">
            próximo →
          </Link>
        </div>
        {podeLancar && (
          <Link
            href={`/pcp/planejar?data=${data}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {pcp ? "Editar plano" : "Montar plano do dia"}
          </Link>
        )}
      </div>

      {linhas.length > 0 ? (
        <>
          <FolhaPCP data={porExtenso(data)} turnos={colunas} linhas={linhas} podeLancar={podeLancar} />
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
            <p className="text-2xl font-semibold text-zinc-700">Nenhum plano para {porExtenso(data)}</p>
            <p className="text-zinc-500">
              {podeLancar ? "Monte o plano para a produção ver o que fazer." : "Aguardando o planejamento."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
