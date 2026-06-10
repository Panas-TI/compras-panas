import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export default async function RelatoriosEntregasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "aprovador") redirect("/");

  const hoje = isoToday();
  const seteDiasAtras = isoDaysAgo(6); // inclui hoje
  const trintaDiasAtras = isoDaysAgo(29);

  // === KPIs ===
  const [
    { count: countHoje },
    { count: countSemana },
    { count: countMes },
    { count: entreguesMes },
    { count: naoEntreguesMes },
    { data: entreguesParaTempo },
    { data: porMotoristaRaw },
    { data: porDiaRaw },
    { data: motivos },
  ] = await Promise.all([
    supabase.from("entregas").select("*", { count: "exact", head: true }).eq("data_entrega", hoje),
    supabase
      .from("entregas")
      .select("*", { count: "exact", head: true })
      .gte("data_entrega", seteDiasAtras),
    supabase
      .from("entregas")
      .select("*", { count: "exact", head: true })
      .gte("data_entrega", trintaDiasAtras),
    supabase
      .from("entregas")
      .select("*", { count: "exact", head: true })
      .gte("data_entrega", trintaDiasAtras)
      .eq("status", "entregue"),
    supabase
      .from("entregas")
      .select("*", { count: "exact", head: true })
      .gte("data_entrega", trintaDiasAtras)
      .eq("status", "nao_entregue"),
    // Tempo médio entrega: entregue_at - criado_em
    supabase
      .from("entregas")
      .select("criado_em, entregue_at")
      .gte("data_entrega", trintaDiasAtras)
      .eq("status", "entregue")
      .not("entregue_at", "is", null)
      .limit(500),
    // Por motorista (mês)
    supabase
      .from("entregas")
      .select("motorista_id, status, motorista:profiles!entregas_motorista_id_fkey(nome)")
      .gte("data_entrega", trintaDiasAtras)
      .limit(2000),
    // Por dia (mês)
    supabase
      .from("entregas")
      .select("data_entrega, status")
      .gte("data_entrega", trintaDiasAtras)
      .limit(2000),
    // Motivos de não-entrega (mês)
    supabase
      .from("entregas")
      .select("motivo_nao_entrega")
      .gte("data_entrega", trintaDiasAtras)
      .eq("status", "nao_entregue")
      .not("motivo_nao_entrega", "is", null)
      .limit(500),
  ]);

  // Taxa de sucesso = entregues / (entregues + não_entregues)
  const concluidasMes = (entreguesMes ?? 0) + (naoEntreguesMes ?? 0);
  const taxaSucesso = concluidasMes > 0 ? ((entreguesMes ?? 0) / concluidasMes) * 100 : null;

  // Tempo médio (em horas)
  const tempos = (entreguesParaTempo ?? [])
    .map((e) => {
      if (!e.criado_em || !e.entregue_at) return null;
      const ms = new Date(e.entregue_at).getTime() - new Date(e.criado_em).getTime();
      return ms > 0 ? ms : null;
    })
    .filter((v): v is number => v !== null);
  const tempoMedioH = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length / 1000 / 3600 : null;

  // Agrupa por motorista
  const motoristasMap = new Map<string, { nome: string; total: number; entregues: number }>();
  for (const e of porMotoristaRaw ?? []) {
    const id = e.motorista_id ?? "—";
    const nome = e.motorista?.nome ?? "Sem motorista";
    const cur = motoristasMap.get(id) ?? { nome, total: 0, entregues: 0 };
    cur.total += 1;
    if (e.status === "entregue") cur.entregues += 1;
    motoristasMap.set(id, cur);
  }
  const motoristas = Array.from(motoristasMap.values()).sort((a, b) => b.total - a.total);
  const maxMotorista = motoristas.length > 0 ? motoristas[0].total : 1;

  // Agrupa por dia (últimos 30 dias incluindo zeros)
  const porDia = new Map<string, { total: number; entregues: number }>();
  for (let i = 29; i >= 0; i--) {
    porDia.set(isoDaysAgo(i), { total: 0, entregues: 0 });
  }
  for (const e of porDiaRaw ?? []) {
    const cur = porDia.get(e.data_entrega);
    if (cur) {
      cur.total += 1;
      if (e.status === "entregue") cur.entregues += 1;
    }
  }
  const dias = Array.from(porDia.entries());
  const maxDia = Math.max(1, ...dias.map(([, v]) => v.total));

  // Motivos não-entrega
  const motivosMap = new Map<string, number>();
  for (const m of motivos ?? []) {
    if (!m.motivo_nao_entrega) continue;
    motivosMap.set(m.motivo_nao_entrega, (motivosMap.get(m.motivo_nao_entrega) ?? 0) + 1);
  }
  const motivosArr = Array.from(motivosMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios de entregas</h1>
          <p className="text-sm text-zinc-600">Janela: últimos 30 dias.</p>
        </div>
        <a
          href={`/api/entregas/csv?desde=${trintaDiasAtras}`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          📥 Baixar CSV (30 dias)
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Hoje" value={String(countHoje ?? 0)} />
        <KpiCard label="7 dias" value={String(countSemana ?? 0)} />
        <KpiCard label="30 dias" value={String(countMes ?? 0)} />
        <KpiCard
          label="Taxa de sucesso (30d)"
          value={taxaSucesso == null ? "—" : `${taxaSucesso.toFixed(1)}%`}
          tone={taxaSucesso == null ? undefined : taxaSucesso >= 90 ? "good" : taxaSucesso >= 75 ? "warn" : "bad"}
        />
        <KpiCard
          label="Tempo médio até entrega"
          value={tempoMedioH == null ? "—" : tempoMedioH < 24 ? `${tempoMedioH.toFixed(1)}h` : `${(tempoMedioH / 24).toFixed(1)}d`}
        />
      </div>

      {/* Entregas por dia */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregas por dia (30 dias)</CardTitle>
          <p className="text-xs text-zinc-500">
            Cinza = cadastradas, verde = entregues. Passa o mouse num dia pra ver os números.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex h-44 items-end gap-1">
            {dias.map(([iso, v]) => {
              const hTotal = (v.total / maxDia) * 100;
              const hEntregues = (v.entregues / maxDia) * 100;
              return (
                <div
                  key={iso}
                  className="group relative flex flex-1 flex-col items-stretch justify-end"
                  title={`${dayBR(iso)}: ${v.entregues}/${v.total} entregas`}
                >
                  <div className="relative w-full">
                    <div className="w-full rounded-t bg-zinc-200" style={{ height: `${hTotal * 1.4}px` }} />
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-emerald-500"
                      style={{ height: `${hEntregues * 1.4}px` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500 group-hover:text-zinc-900">
                    {iso.slice(8, 10)}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Por motorista */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por motorista (30 dias)</CardTitle>
          <p className="text-xs text-zinc-500">Total cadastradas (cinza claro) e entregues (azul).</p>
        </CardHeader>
        <CardContent>
          {motoristas.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Sem entregas atribuídas a motoristas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {motoristas.map((m, idx) => {
                const taxa = m.total > 0 ? (m.entregues / m.total) * 100 : 0;
                return (
                  <li key={idx} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{m.nome}</span>
                      <span className="tabular-nums text-zinc-600">
                        {m.entregues}/{m.total} ({taxa.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="relative h-5 w-full overflow-hidden rounded bg-zinc-100">
                      <div
                        className="absolute left-0 top-0 h-full bg-zinc-300"
                        style={{ width: `${(m.total / maxMotorista) * 100}%` }}
                      />
                      <div
                        className="absolute left-0 top-0 h-full bg-blue-500"
                        style={{ width: `${(m.entregues / maxMotorista) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Motivos não-entrega */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Motivos de não-entrega (30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {motivosArr.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Nenhuma não-entrega no período. 🎉</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {motivosArr.map(([motivo, n]) => (
                <li key={motivo} className="flex items-center justify-between gap-2 text-sm">
                  <span>{motivo}</span>
                  <span className="tabular-nums text-zinc-600">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="text-sm">
        <Link href="/entregas/dia" className="text-zinc-600 hover:underline">
          ← Voltar pra lista do dia
        </Link>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "";
  return (
    <Card>
      <CardHeader>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={`text-3xl font-semibold tabular-nums ${cls}`}>{value}</p>
      </CardHeader>
    </Card>
  );
}
