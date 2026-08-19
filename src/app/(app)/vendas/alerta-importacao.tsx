import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateBR } from "@/lib/utils";

/** A partir desta hora, a venda de ontem já devia estar no sistema. */
const HORA_LIMITE = 10;

/**
 * Aviso de importação atrasada, no topo de todas as telas de Vendas.
 *
 * Com importação manual o risco não é o esforço (leva menos de um minuto) — é
 * esquecer. E quem esquece é justamente quem não vai perceber. Por isso o aviso
 * aparece pra todo mundo, não só pra quem deveria ter feito.
 */
export async function AlertaImportacao() {
  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("vendas_pedidos")
    .select("data")
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimo?.data) return null;

  const agora = new Date();
  const hoje = agora.toISOString().slice(0, 10);
  const atraso = Math.floor(
    (new Date(hoje + "T12:00:00").getTime() - new Date(ultimo.data + "T12:00:00").getTime()) /
      86_400_000
  );

  // Antes da hora limite, um dia de atraso é normal: a venda de ontem ainda
  // não foi importada e ninguém está atrasado.
  const tolerancia = agora.getHours() < HORA_LIMITE ? 2 : 1;
  const diaSemana = agora.getDay();
  // Segunda de manhã ainda carrega o fim de semana sem venda.
  const folga = diaSemana === 1 ? 2 : 0;

  if (atraso <= tolerancia + folga) return null;

  const grave = atraso > 4;

  return (
    <div
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${
        grave
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <strong>
        ⚠ As vendas não são importadas há {atraso} dias
      </strong>{" "}
      — a última registrada é de {formatDateBR(ultimo.data)}.
      <p className="mt-1">
        A fila de hoje está apontando cliente que já comprou, e o placar da meta está
        incompleto.{" "}
        <Link
          href="/vendas/relatorio-semanal"
          className="font-medium underline underline-offset-4"
        >
          Importar agora →
        </Link>
      </p>
    </div>
  );
}
