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

  // RLS já filtra: motorista vê só as dele; aprovador vê todas.
  // Mas no painel queremos só as do motorista logado quando role=aprovador (visualizando).
  // Pra aprovador, mostra TODAS as do dia atribuídas a ELE como motorista (caso teste atribuindo a si mesmo).
  const { data: entregasHoje } = await supabase
    .from("entregas")
    .select("id, codigo_queops, status, hora_entrega, cliente_nome, bairro, entregue_at")
    .eq("data_entrega", hoje)
    .eq("motorista_id", user.id)
    .order("hora_entrega", { ascending: true, nullsFirst: false });

  const pendentes = (entregasHoje ?? []).filter((e) => e.status === "pendente" || e.status === "em_rota");
  const entregues = (entregasHoje ?? []).filter((e) => e.status === "entregue");

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
