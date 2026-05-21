import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/layout/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, role, ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.ativo) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 print:bg-white">
      <div className="print:hidden">
        <Nav role={profile.role as "comprador" | "aprovador" | "estoquista"} nome={profile.nome} />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-2">
        {children}
      </main>
    </div>
  );
}
