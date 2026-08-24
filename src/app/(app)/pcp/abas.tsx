import Link from "next/link";
import type { TipoFolha } from "./actions";

/**
 * As duas folhas do mesmo dia. Produto acabado é o que sai pra venda; recheio
 * e massa é o que abastece a produção — quem faz um precisa enxergar o outro,
 * mas não misturado na mesma tabela.
 */
export function AbasPCP({
  base,
  tipo,
  contagem,
}: {
  /** URL sem o parâmetro de aba — ex: `/pcp/2026-08-24` ou `/pcp/planejar?data=…` */
  base: string;
  tipo: TipoFolha;
  contagem?: { final: number; intermediario: number };
}) {
  const sep = base.includes("?") ? "&" : "?";
  const abas: { chave: TipoFolha; rotulo: string; href: string }[] = [
    { chave: "final", rotulo: "Produtos acabados", href: base },
    { chave: "intermediario", rotulo: "Recheios e massas", href: `${base}${sep}aba=recheios` },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-zinc-200 print:hidden">
      {abas.map((a) => {
        const ativa = a.chave === tipo;
        const n = contagem?.[a.chave];
        return (
          <Link
            key={a.chave}
            href={a.href}
            className={`-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              ativa
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            {a.rotulo}
            {n != null && n > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                  ativa ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
