/**
 * Os filtros que decidem se um cliente some da lista.
 *
 * Foi aqui que os bugs moraram. Cada teste abaixo é um deles, fixado com o
 * caso real que o revelou.
 */
import { describe, it, expect } from "vitest";
import {
  silenciaHoje,
  viraRetornoHoje,
  viraAcompanhamentoHoje,
  cansouDeTentar,
  type UltimoContato,
} from "./plano-do-dia";

const HOJE = "2026-09-29";
const contato = (p: Partial<UltimoContato>): UltimoContato => ({
  adiar_ate: null,
  concluidoEm: null,
  criado_em: `${HOJE}T09:00:00-03:00`,
  // O padrão dos testes é o caso comum: data calculada pelo sistema, não
  // acordada com o cliente. Era exatamente isto que a tela chamava de
  // "retorno combinado".
  combinado: false,
  tentativas: 0,
  ...p,
});

describe("quem fica calado hoje", () => {
  it("data futura cala", () => {
    expect(silenciaHoje(contato({ adiar_ate: "2026-10-05" }), HOJE)).toBe(true);
  });

  it("marcado pra voltar HOJE não fica calado — este era o vão", () => {
    // Com `>=` em vez de `>`, a fila tirava por ter data marcada e o retorno
    // só pegava data vencida: o cliente sumia das duas pontas justamente no
    // dia que ele mesmo pediu. Eram 9 clientes num dia só.
    expect(silenciaHoje(contato({ adiar_ate: HOJE }), HOJE)).toBe(false);
  });

  it("data vencida não cala", () => {
    expect(silenciaHoje(contato({ adiar_ate: "2026-09-01" }), HOJE)).toBe(false);
  });

  it("sem contato nenhum não cala", () => {
    expect(silenciaHoje(null, HOJE)).toBe(false);
    expect(silenciaHoje(undefined, HOJE)).toBe(false);
    expect(silenciaHoje(contato({ adiar_ate: null }), HOJE)).toBe(false);
  });
});

describe("retorno combinado — só quando o cliente pediu", () => {
  it("data acordada que venceu é retorno", () => {
    expect(
      viraRetornoHoje(
        contato({ adiar_ate: HOJE, combinado: true, concluidoEm: `${HOJE}T10:00:00-03:00` }),
        HOJE
      )
    ).toBe(true);
  });

  it("palpite do sistema NUNCA é retorno combinado", () => {
    // O bug que entupiu a lista: 68 dos 107 combinados vencidos num dia eram
    // data que o próprio sistema calculou quando ninguém classificou o
    // contato — e, como a faixa vem no topo, passavam na frente de quem
    // estava vencendo o ciclo de compra.
    expect(
      viraRetornoHoje(
        contato({ adiar_ate: "2026-09-20", combinado: false, criado_em: "2026-09-18T09:00:00-03:00" }),
        HOJE
      )
    ).toBe(false);
  });

  it("data acordada no futuro ainda não é retorno", () => {
    expect(viraRetornoHoje(contato({ adiar_ate: "2026-12-30", combinado: true }), HOJE)).toBe(false);
  });
});

describe("acompanhamento — falei, não comprou, volta", () => {
  it("prazo da escada venceu e o pedido não veio", () => {
    expect(
      viraAcompanhamentoHoje(
        contato({ adiar_ate: "2026-09-27", criado_em: "2026-09-25T09:00:00-03:00" }),
        HOJE
      )
    ).toBe(true);
  });

  it("o que foi acordado é retorno, não acompanhamento — nunca os dois", () => {
    const c = contato({ adiar_ate: "2026-09-27", combinado: true, criado_em: "2026-09-25T09:00:00-03:00" });
    expect(viraRetornoHoje(c, HOJE)).toBe(true);
    expect(viraAcompanhamentoHoje(c, HOJE)).toBe(false);
  });

  it("registro de hoje não volta hoje", () => {
    expect(viraAcompanhamentoHoje(contato({ adiar_ate: HOJE }), HOJE)).toBe(false);
  });

  it("passou da quarta tentativa, sai da lista do dia", () => {
    // Há cliente na base com 13 tentativas e nenhum pedido. Insistir pela
    // quinta vez não é persistência — é ocupar a vaga de quem compraria.
    const c = contato({ adiar_ate: "2026-09-27", tentativas: 4, criado_em: "2026-09-25T09:00:00-03:00" });
    expect(cansouDeTentar(c)).toBe(true);
    expect(viraAcompanhamentoHoje(c, HOJE)).toBe(false);
    expect(viraRetornoHoje(c, HOJE)).toBe(false);
  });

  it("até a quarta, continua na lista", () => {
    for (const t of [0, 1, 2, 3]) {
      const c = contato({ adiar_ate: "2026-09-27", tentativas: t, criado_em: "2026-09-25T09:00:00-03:00" });
      expect(viraAcompanhamentoHoje(c, HOJE)).toBe(true);
    }
  });
});

describe("a propriedade que tem que valer sempre", () => {
  /**
   * Nenhum cliente pode cair entre as duas regras.
   *
   * Os três primeiros bugs tinham o mesmo formato: o cliente não era
   * silenciado por nenhum motivo nomeável E também não era pescado como
   * retorno. Ficava em lugar nenhum — sem erro, sem aviso, e só aparecia
   * quando o vendedor reparava a falta no WhatsApp.
   *
   * Aqui a regra é cobrada em todas as datas possíveis ao redor de hoje, nas
   * quatro combinações de concluído e dia de criação.
   */
  it("silenciado ou disponível, nunca em lugar nenhum", () => {
    const datas = ["2026-09-01", "2026-09-28", HOJE, "2026-09-30", "2026-12-31"];
    const criados = [`${HOJE}T09:00:00-03:00`, "2026-09-10T09:00:00-03:00"];
    const concluidos = [null, `${HOJE}T11:00:00-03:00`];

    for (const adiar_ate of datas) {
      for (const criado_em of criados) {
        for (const concluidoEm of concluidos) {
          const c = contato({ adiar_ate, criado_em, concluidoEm });
          for (const combinado of [false, true]) {
            const c2 = { ...c, combinado };
            const calado = silenciaHoje(c2, HOJE);
            const retorno = viraRetornoHoje(c2, HOJE);
            const acomp = viraAcompanhamentoHoje(c2, HOJE);

            // No máximo uma vale: duas seriam o cliente duplicado na tela.
            expect([calado, retorno, acomp].filter(Boolean).length).toBeLessThanOrEqual(1);

            // E quando nenhuma vale, o cliente TEM que estar livre pra entrar
            // pela fila natural — nunca preso fora de tudo.
            if (!calado && !retorno && !acomp) {
              expect(String(adiar_ate) <= HOJE).toBe(true);
            }
          }
        }
      }
    }
  });
});
