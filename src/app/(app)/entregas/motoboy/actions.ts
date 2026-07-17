"use server";

import { createClient } from "@/lib/supabase/server";

export type CorridaSalva = {
  pedido: string;
  dataHora: string;
  entregador: string;
  endereco: string;
  km: number | null;
  aprox?: boolean;
  resolvido?: string;
  motivo?: "semrua" | "semrota";
};

// Salva o resultado da importação no banco pra qualquer usuário/computador ver.
export async function salvarRelatorioMotoboy(corridas: CorridaSalva[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, erro: "não autenticado" };

  const kmTotal = corridas.reduce((s, c) => s + (c.km ?? 0), 0);
  const { error } = await supabase.from("motoboy_relatorios").insert({
    importado_por: user.email ?? null,
    n_corridas: corridas.length,
    km_total: Number(kmTotal.toFixed(2)),
    corridas,
  });
  if (error) return { ok: false as const, erro: error.message };
  return { ok: true as const };
}
