import {
  ROTAS,
  DIAS,
  DIAS_CURTO,
  diaDaSemana,
  recadoDoDia,
  quandoLigarPara,
  type Rota,
} from "./rota-regras";

/**
 * A regra de entrega, aplicada ao dia de hoje.
 *
 * Existe pra que quem senta aqui pela primeira vez não precise saber de nada:
 * em vez de "a Serra é quinta e o pedido fecha 1 a 2 dias antes" — que era
 * conhecimento de cabeça — a tela já diz o que fechar hoje alcança. A tabela
 * completa fica dobrada, pra consulta, sem ocupar a tela no uso diário.
 */
export function RotasHoje({ hoje }: { hoje: string }) {
  const dia = diaDaSemana(hoje);
  const fimDeSemana = dia > 5;

  const linhas: { rota: Rota; texto: string; bom: boolean }[] = (
    ["poa", "caminho_serra", "serra"] as Rota[]
  ).map((r) => {
    const rec = recadoDoDia(r, hoje);
    return { rota: r, texto: rec.texto.replace("fechando hoje, chega ", ""), bom: rec.bom };
  });

  return (
    <details className="rounded-md border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <span className="font-semibold text-zinc-900">
          Hoje é {DIAS[dia]}
          {fimDeSemana && " — não há entrega"}
        </span>
        {!fimDeSemana &&
          linhas.map((l) => (
            <span key={l.rota} className="text-zinc-600">
              <span
                className={`mr-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ROTAS[l.rota].classe}`}
              >
                {ROTAS[l.rota].curto}
              </span>
              fechando hoje chega{" "}
              <strong className={l.bom ? "text-emerald-700" : "text-amber-700"}>{l.texto}</strong>
            </span>
          ))}
        <span className="ml-auto text-xs text-zinc-400">como funciona ↓</span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3 text-sm">
        <p className="text-zinc-600">
          Entrega de <strong>segunda a sexta</strong>, nunca fim de semana. O pedido se fecha de{" "}
          <strong>1 a 2 dias úteis antes</strong>. Pedido do dia pro dia é exceção — só sai se o
          estoque cobrir.
        </p>

        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1 pr-6">Pra entregar…</th>
                <th className="py-1">…ligar em</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((d) => {
                const [a, b] = quandoLigarPara(d);
                return (
                  <tr key={d} className={d === dia ? "font-medium text-zinc-900" : "text-zinc-600"}>
                    <td className="py-1 pr-6">
                      {DIAS[d]}
                      {d === 4 && <span className="ml-1 text-violet-700">· dia da Serra</span>}
                      {d === 1 && (
                        <span className="ml-1 text-zinc-400">· cai na semana anterior</span>
                      )}
                    </td>
                    <td className="py-1">
                      {DIAS[a]} ou {DIAS[b]}
                      {quandoLigarPara(d).includes(dia) && (
                        <span className="ml-1 text-emerald-700">← é hoje</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col gap-1 text-zinc-600">
          {(["poa", "caminho_serra", "serra"] as Rota[]).map((r) => (
            <li key={r}>
              <span
                className={`mr-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ROTAS[r].classe}`}
              >
                {ROTAS[r].curto}
              </span>
              <strong className="text-zinc-800">{ROTAS[r].rotulo}</strong> — {ROTAS[r].desc}
              <span className="ml-1 text-xs text-zinc-400">
                ({ROTAS[r].dias.map((d) => DIAS_CURTO[d]).join(", ")})
              </span>
            </li>
          ))}
          <li>
            <span className="mr-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
              definir
            </span>
            <strong className="text-zinc-800">Rota a definir</strong> — {ROTAS.a_definir.desc}.
            Trate como Porto Alegre até confirmar; a etiqueta ao lado do nome troca em um clique.
          </li>
        </ul>
      </div>
    </details>
  );
}
