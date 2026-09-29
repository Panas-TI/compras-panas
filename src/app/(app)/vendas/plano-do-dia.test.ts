/**
 * Os filtros que decidem se um cliente some da lista.
 *
 * Foi aqui que os bugs moraram. Cada teste abaixo é um deles, fixado com o
 * caso real que o revelou.
 */
import { describe, it, expect } from "vitest";
import { silenciaHoje, viraRetornoHoje, type UltimoContato } from "./plano-do-dia";

const HOJE = "2026-09-29";
const contato = (p: Partial<UltimoContato>): UltimoContato => ({
  adiar_ate: null,
  concluidoEm: null,
  criado_em: `${HOJE}T09:00:00-03:00`,
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

describe("quem volta como retorno combinado", () => {
  it("a data chegou e o assunto foi fechado por alguém", () => {
    expect(
      viraRetornoHoje(contato({ adiar_ate: HOJE, concluidoEm: `${HOJE}T10:00:00-03:00` }), HOJE)
    ).toBe(true);
  });

  it("registro automático de hoje não volta hoje", () => {
    // Um clique registra "ainda sem resposta" e agenda a volta sozinho; sem
    // esta regra o cliente voltava na mesma hora com o selo "falado hoje"
    // pedindo pra ligar de novo.
    expect(viraRetornoHoje(contato({ adiar_ate: HOJE, concluidoEm: null }), HOJE)).toBe(false);
  });

  it("promessa velha volta mesmo sem ter sido concluída", () => {
    expect(
      viraRetornoHoje(
        contato({ adiar_ate: "2026-09-20", criado_em: "2026-09-18T09:00:00-03:00" }),
        HOJE
      )
    ).toBe(true);
  });

  it("data no futuro não é retorno", () => {
    expect(viraRetornoHoje(contato({ adiar_ate: "2026-10-10" }), HOJE)).toBe(false);
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
          const calado = silenciaHoje(c, HOJE);
          const retorno = viraRetornoHoje(c, HOJE);

          // As duas nunca valem ao mesmo tempo: seria o cliente duplicado na
          // tela, contado duas vezes.
          expect(calado && retorno).toBe(false);

          // E quando nenhuma vale, o cliente TEM que estar livre pra entrar
          // pela fila natural — nunca preso fora de tudo.
          if (!calado && !retorno) {
            expect(String(adiar_ate) <= HOJE).toBe(true);
          }
        }
      }
    }
  });
});
