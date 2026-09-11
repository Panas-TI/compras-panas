import { createClient } from "@/lib/supabase/server";
import { diaEmSP } from "./contato-regras";

export type Cobertura = {
  /** Último dia que os números do sistema realmente cobrem. */
  ate: string | null;
  /** Dias úteis entre a cobertura e hoje — o que ainda não entrou. */
  diasEmFalta: string[];
  importadoEm: string | null;
  importadoPor: string | null;
};

/**
 * Até que dia os números de vendas vão.
 *
 * Nasceu de uma divergência real: o Queóps mostrava R$ 32.449,95 na semana e o
 * sistema R$ 22.774,45. Não faltava pedido — os dias 08, 09 e 10 batiam ao
 * centavo. Faltava o dia 11, que nunca esteve no arquivo importado: a
 * exportação daquele dia cobria só 10/09.
 *
 * Nada na tela dizia isso. A importação tinha rodado HOJE, então o aviso de
 * atraso (que mede a hora da importação) ficava quieto, e o placar anunciava o
 * total da semana sem avisar que a semana estava pela metade. Quem comparasse
 * com o ERP concluiria que o sistema perde venda.
 */
export async function coberturaVendas(): Promise<Cobertura> {
  const supabase = await createClient();
  const hoje = diaEmSP(new Date());

  const [{ data: ultima }, { data: maxPeriodo }] = await Promise.all([
    supabase
      .from("vendas_importacoes")
      .select("importado_em, importado_por")
      .order("importado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // O maior período JÁ IMPORTADO, não o da última importação: reimportar um
    // arquivo antigo não pode fazer a cobertura andar pra trás.
    supabase
      .from("vendas_importacoes")
      .select("periodo_fim")
      .not("periodo_fim", "is", null)
      .order("periodo_fim", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Teto em hoje: o arquivo traz pedido agendado pra frente, e cobertura no
  // futuro faria o sistema se declarar em dia com o dia de hoje vazio.
  const bruto = maxPeriodo?.periodo_fim ?? null;
  const ate = bruto && bruto > hoje ? hoje : bruto;

  return {
    ate,
    diasEmFalta: ate ? diasUteisEntre(ate, hoje) : [],
    importadoEm: ultima?.importado_em ?? null,
    importadoPor: ultima?.importado_por ?? null,
  };
}

/** Dias úteis DEPOIS de `de`, até `ate` inclusive. Sábado e domingo não contam. */
export function diasUteisEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d <= fim) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
