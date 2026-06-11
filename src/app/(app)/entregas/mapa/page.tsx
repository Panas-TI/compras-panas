import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapaCliente, type EntregaPin } from "./mapa-cliente";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function MapaEntregasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayISO();
  const motoristaFilter = typeof sp.motorista === "string" ? sp.motorista : "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.role || !["aprovador", "comprador"].includes(profile.role)) redirect("/");

  let query = supabase
    .from("entregas")
    .select(
      `
      id, codigo_queops, cliente_nome, bairro, valor_total,
      entregue_at, entrega_lat, entrega_lng, entrega_precisao_metros,
      motorista_id,
      motorista:profiles!entregas_motorista_id_fkey(nome)
    `
    )
    .eq("data_entrega", data)
    .eq("status", "entregue")
    .not("entrega_lat", "is", null)
    .not("entrega_lng", "is", null);

  if (motoristaFilter) query = query.eq("motorista_id", motoristaFilter);

  const [{ data: entregas }, { data: motoristas }] = await Promise.all([
    query,
    supabase
      .from("profiles")
      .select("id, nome")
      .eq("role", "motorista")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const pins: EntregaPin[] = (entregas ?? []).map((e) => ({
    id: e.id,
    codigo: e.codigo_queops,
    cliente: e.cliente_nome,
    bairro: e.bairro,
    valor: e.valor_total,
    entregueAt: e.entregue_at,
    lat: Number(e.entrega_lat),
    lng: Number(e.entrega_lng),
    precisaoM: e.entrega_precisao_metros,
    motoristaId: e.motorista_id,
    motoristaNome: e.motorista?.nome ?? null,
  }));

  // Total de entregas com GPS no dia (mesmo sem filtro de motorista) pra contexto
  const { count: totalEntreguesComGps } = await supabase
    .from("entregas")
    .select("*", { count: "exact", head: true })
    .eq("data_entrega", data)
    .eq("status", "entregue")
    .not("entrega_lat", "is", null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Mapa de entregas</h1>
        <p className="text-sm text-zinc-600">
          {pins.length} pin(s) no mapa
          {motoristaFilter && totalEntreguesComGps && pins.length !== totalEntreguesComGps && (
            <> (de {totalEntreguesComGps} entregas com GPS no dia)</>
          )}
          .
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="data">
            Data
          </label>
          <Input id="data" name="data" type="date" defaultValue={data} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="motorista">
            Motorista
          </label>
          <Select id="motorista" name="motorista" defaultValue={motoristaFilter}>
            <option value="">Todos</option>
            {(motoristas ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>

      {pins.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Nenhuma entrega com GPS pra essa data/motorista.
            <br />
            <Link href="/entregas/dia" className="mt-2 inline-block text-zinc-900 underline-offset-4 hover:underline">
              Ver lista do dia →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <MapaCliente pins={pins} />
      )}
    </div>
  );
}
