import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Painel } from "./painel";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function MotoristaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, role, ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.ativo) redirect("/login");

  // Aprovador também pode acessar (visualização). Outros caem no hub.
  if (profile.role !== "motorista" && profile.role !== "aprovador") {
    redirect("/");
  }

  const hoje = todayISO();

  // Pendentes: TODOS do dia que podem ser pegos por este motorista
  //   - sem motorista atribuído (qualquer um pode pegar bipando) OU
  //   - atribuídos a este motorista
  // Entregues: apenas as que ESTE motorista entregou (RLS + filtro).
  const [{ data: pendentesRaw }, { data: entreguesRaw }] = await Promise.all([
    supabase
      .from("entregas")
      .select("id, codigo_queops, status, hora_entrega, cliente_nome, bairro, entregue_at, motorista_id")
      .eq("data_entrega", hoje)
      .in("status", ["pendente", "em_rota"])
      .or(`motorista_id.is.null,motorista_id.eq.${user.id}`)
      .order("hora_entrega", { ascending: true, nullsFirst: false }),
    supabase
      .from("entregas")
      .select("id, codigo_queops, status, hora_entrega, cliente_nome, bairro, entregue_at, motorista_id")
      .eq("data_entrega", hoje)
      .eq("status", "entregue")
      .eq("motorista_id", user.id)
      .order("entregue_at", { ascending: false }),
  ]);

  const pendentes = pendentesRaw ?? [];
  const entregues = entreguesRaw ?? [];

  return (
    <Painel
      nome={profile.nome}
      data={hoje}
      pendentes={pendentes}
      entregues={entregues}
      role={profile.role}
    />
  );
}
