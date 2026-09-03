import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** A partir desta hora, a venda de ontem já devia estar no sistema. */
const HORA_LIMITE = 10;

/**
 * Aviso de importação atrasada, no topo de todas as telas de Vendas.
 *
 * Mede pela ÚLTIMA IMPORTAÇÃO FEITA, não pela data do pedido mais recente.
 * O relatório é puxado da semana inteira e traz pedido agendado para os
 * próximos dias — pela data do pedido, o sistema acharia que está sempre em
 * dia (a data mais recente fica no futuro) e o aviso nunca mais apareceria.
 *
 * Com importação manual o risco não é o esforço (leva menos de um minuto) — é
 * esquecer. E quem esquece é justamente quem não vai perceber. Por isso o aviso
 * aparece pra todo mundo, não só pra quem deveria ter feito.
 */
export async function AlertaImportacao() {
  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from("vendas_importacoes")
    .select("importado_em, importado_por")
    .order("importado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultima?.importado_em) return null;

  const agora = new Date();
  const quando = new Date(ultima.importado_em);
  const dias = Math.floor(
    (new Date(agora.toDateString()).getTime() - new Date(quando.toDateString()).getTime()) /
      86_400_000
  );

  // Antes da hora limite, um dia sem importar é normal: a venda de ontem ainda
  // não foi lançada e ninguém está atrasado.
  const tolerancia = agora.getHours() < HORA_LIMITE ? 2 : 1;
  const diaSemana = agora.getDay();
  // Segunda de manhã ainda carrega o fim de semana sem venda.
  const folga = diaSemana === 1 ? 2 : 0;

  if (dias <= tolerancia + folga) return null;

  const grave = dias > 4;
  const dataBR = quando.toLocaleDateString("pt-BR");
  const horaBR = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${
        grave
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <strong>
        ⚠ As vendas não são importadas há {dias} {dias === 1 ? "dia" : "dias"}
      </strong>{" "}
      — última importação em {dataBR} às {horaBR}
      {ultima.importado_por ? ` por ${ultima.importado_por}` : ""}.
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
