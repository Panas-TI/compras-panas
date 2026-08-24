import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export default async function PCPListaPage() {
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

  const { data: dias } = await supabase
    .from("pcp_dia")
    .select(
      `id, data, observacoes,
       criador:profiles!pcp_dia_criado_por_fkey(nome),
       linhas:pcp_linha(projetado, realizado)`
    )
    .order("data", { ascending: false })
    .limit(120);

  const planos = (dias ?? []).map((d) => {
    const linhas = d.linhas ?? [];
    const projetado = linhas.reduce((s, l) => s + Number(l.projetado ?? 0), 0);
    const realizado = linhas.reduce((s, l) => s + Number(l.realizado ?? 0), 0);
    const lancadas = linhas.filter((l) => l.realizado !== null).length;
    return {
      id: d.id,
      data: d.data,
      criador: d.criador?.nome ?? null,
      observacoes: d.observacoes,
      projetado,
      realizado,
      linhas: linhas.length,
      // Fechado = toda linha teve o realizado lançado. É o que diferencia
      // "produção em andamento" de "dia encerrado".
      pendentes: linhas.length - lancadas,
    };
  });

  const temHoje = planos.some((p) => p.data === hoje);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">PCP — Planos de produção</h1>
          <p className="text-sm text-zinc-600">
            {planos.length} {planos.length === 1 ? "plano salvo" : "planos salvos"}. Abra um dia para
            ver a folha e lançar o realizado.
          </p>
        </div>
        {podePlanejar && (
          <Link
            href={`/pcp/planejar?data=${hoje}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {temHoje ? "Editar plano de hoje" : "+ Novo plano"}
          </Link>
        )}
      </div>

      {!temHoje && podePlanejar && planos.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ainda não há plano para <strong>hoje</strong>. A produção abre a tela e não encontra
          orientação.
        </div>
      )}

      {planos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-5xl">📋</div>
            <p className="text-xl font-semibold text-zinc-700">Nenhum plano salvo ainda</p>
            <p className="text-sm text-zinc-500">
              {podePlanejar
                ? "Monte o primeiro plano para a produção ver o que fazer."
                : "Aguardando o planejamento."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3">
        {planos.map((p) => {
          const d = new Date(p.data + "T12:00:00");
          const ehHoje = p.data === hoje;
          const atingido = p.projetado > 0 ? Math.round((p.realizado / p.projetado) * 100) : 0;
          return (
            <Link key={p.id} href={`/pcp/${p.data}`}>
              <Card
                className={`transition-shadow hover:shadow-md ${
                  ehHoje ? "border-emerald-300 ring-1 ring-emerald-200" : ""
                }`}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatDateBR(p.data)}</span>
                      <span className="text-sm text-zinc-500">{DIAS[d.getDay()]}</span>
                      {ehHoje && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                          hoje
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-600">
                      {p.linhas} {p.linhas === 1 ? "lançamento" : "lançamentos"}
                      {p.criador && <> · {p.criador}</>}
                      {p.observacoes && <> · {p.observacoes}</>}
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Projetado</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {p.projetado.toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Realizado</div>
                      <div
                        className={`text-lg font-semibold tabular-nums ${
                          p.realizado === 0
                            ? "text-zinc-400"
                            : p.realizado < p.projetado
                              ? "text-amber-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {p.realizado.toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500">
                        {p.pendentes > 0 ? "A lançar" : "Atingido"}
                      </div>
                      <div
                        className={`text-lg font-semibold tabular-nums ${
                          p.pendentes > 0 ? "text-amber-700" : "text-zinc-900"
                        }`}
                      >
                        {p.pendentes > 0 ? p.pendentes : `${atingido}%`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
