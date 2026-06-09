"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAprovador() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") {
    return { ok: false as const, error: "Apenas aprovador pode cadastrar entregas." };
  }
  return { ok: true as const, userId: user.id };
}

export type ItemPedido = {
  quantidade: number | null;
  codigo: string | null;
  nome: string | null;
  valor: number | null;
};

export type DadosEntrega = {
  codigo_queops: string | null;
  data_entrega: string | null;
  hora_entrega: string | null;
  area_entrega: number | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  contato_nome: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  valor_total: number | null;
  total_fisico: number | null;
  itens: ItemPedido[];
};

export type SalvarState = {
  ok: true;
  entregaId: string;
} | {
  ok: false;
  error: string;
} | null;

/**
 * Salva a entrega no banco a partir dos campos digitados pelo usuário.
 * Foto é OPCIONAL — se anexada, faz upload pro bucket 'pedidos-originais'.
 */
export async function salvarEntregaAction(
  dados: DadosEntrega,
  fotoBase64: string | null,
  fotoMediaType: "image/jpeg" | "image/png" | "image/webp" | null
): Promise<SalvarState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!dados.codigo_queops) return { ok: false, error: "Código Queóps é obrigatório." };
  if (!dados.cliente_nome) return { ok: false, error: "Cliente é obrigatório." };
  if (!dados.data_entrega) return { ok: false, error: "Data de entrega é obrigatória." };
  if (!dados.endereco_rua) return { ok: false, error: "Endereço (rua) é obrigatório." };

  const supabase = await createClient();

  let fotoPath: string | null = null;

  // 1) Upload da foto (opcional)
  if (fotoBase64 && fotoMediaType) {
    const ext = fotoMediaType === "image/png" ? "png" : fotoMediaType === "image/webp" ? "webp" : "jpg";
    const filename = `${dados.codigo_queops}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(fotoBase64, "base64");
    const { error: upErr } = await supabase.storage
      .from("pedidos-originais")
      .upload(filename, buffer, { contentType: fotoMediaType, upsert: false });
    if (upErr) {
      return { ok: false, error: `Upload da foto falhou: ${upErr.message}` };
    }
    fotoPath = filename;
  }

  // 2) Insert
  const { data: inserted, error: insErr } = await supabase
    .from("entregas")
    .insert({
      codigo_queops: dados.codigo_queops,
      data_entrega: dados.data_entrega,
      hora_entrega: dados.hora_entrega,
      area_entrega: dados.area_entrega,
      cliente_nome: dados.cliente_nome,
      cliente_telefone: dados.cliente_telefone,
      contato_nome: dados.contato_nome,
      endereco_rua: dados.endereco_rua,
      endereco_numero: dados.endereco_numero,
      endereco_complemento: dados.endereco_complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      uf: dados.uf,
      observacoes: dados.observacoes,
      valor_total: dados.valor_total ?? 0,
      total_fisico: dados.total_fisico,
      itens_json: dados.itens ?? [],
      foto_pedido_original_url: fotoPath,
      status: "pendente",
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (insErr) {
    if (fotoPath) await supabase.storage.from("pedidos-originais").remove([fotoPath]);
    if (insErr.code === "23505") {
      return { ok: false, error: `Já existe entrega com código ${dados.codigo_queops}.` };
    }
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/entregas/dia");
  return { ok: true, entregaId: inserted!.id };
}
