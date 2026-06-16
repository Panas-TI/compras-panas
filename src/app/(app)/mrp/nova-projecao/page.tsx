import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NovaProjecaoForm } from "./nova-projecao-form";

function diasDesde(iso: string): number {
  const planejada = new Date(iso + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje.getTime() - planejada.getTime()) / 86_400_000);
}

function proximaQuinta(): string {
  const d = new Date();
  const dia = d.getDay(); // 0 = domingo, 4 = quinta
  const diff = dia <= 4 ? 4 - dia : 4 - dia + 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function NovaProjecaoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Produtos finais ativos (não intermediários)
  const { data: produtos } = await supabase
    .from("produto")
    .select("id, codigo_queops, nome, categoria")
    .eq("ativo", true)
    .eq("tipo", "final")
    .order("nome");

  // Última contagem finalizada
  const { data: ultimaContagem } = await supabase
    .from("contagens")
    .select("id, data_contagem, nome")
    .eq("finalizada", true)
    .order("data_contagem", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Última projeção pra "copiar demanda"
  const { data: ultimaProjecao } = await supabase
    .from("projecao_producao")
    .select(
      `
      id, semana_inicio, semana_fim, status,
      demanda:projecao_demanda(produto_id, quantidade)
    `
    )
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inicioPadrao = proximaQuinta();
  const fimPadraoDt = new Date(inicioPadrao + "T00:00:00");
  fimPadraoDt.setDate(fimPadraoDt.getDate() + 6);
  const fimPadrao = fimPadraoDt.toISOString().slice(0, 10);

  const idadeContagem = ultimaContagem ? diasDesde(ultimaContagem.data_contagem) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Nova projeção</h1>
          <p className="text-sm text-zinc-600">
            Passo 1/3 — lançar a demanda da semana
          </p>
        </div>
        <Link href="/mrp/projecoes" className="text-sm text-zinc-600 hover:underline">
          ← Histórico de projeções
        </Link>
      </div>

      {/* Status do estoque (contagem) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base de estoque</CardTitle>
          {ultimaContagem ? (
            <CardDescription>
              Vou usar a última contagem finalizada:{" "}
              <strong>{ultimaContagem.data_contagem.split("-").reverse().join("/")}</strong>{" "}
              {idadeContagem !== null && (
                <span
                  className={
                    idadeContagem > 7
                      ? "text-red-700"
                      : idadeContagem > 3
                        ? "text-amber-700"
                        : "text-emerald-700"
                  }
                >
                  ({idadeContagem === 0 ? "hoje" : `${idadeContagem}d atrás`})
                </span>
              )}
            </CardDescription>
          ) : (
            <CardDescription className="text-red-700">
              ⚠ Nenhuma contagem finalizada ainda — estoque vai ser tratado como zero, pode dar
              sobrecompra.{" "}
              <Link href="/contagem" className="underline-offset-4 hover:underline">
                Ir pra área de Contagem
              </Link>
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      <NovaProjecaoForm
        produtos={produtos ?? []}
        inicioPadrao={inicioPadrao}
        fimPadrao={fimPadrao}
        ultimaProjecao={
          ultimaProjecao
            ? {
                id: ultimaProjecao.id,
                semana_inicio: ultimaProjecao.semana_inicio,
                demanda: ultimaProjecao.demanda ?? [],
              }
            : null
        }
      />
    </div>
  );
}
