/**
 * Testes das regras que decidem com quem falar.
 *
 * Existem por um motivo concreto: em uma semana, quatro bugs diferentes
 * tiraram clientes vivos de todas as listas, nenhum deu erro, e todos foram
 * descobertos pelo vendedor reparando a falta no WhatsApp. Cada dia até
 * alguém perceber é venda perdida.
 *
 * Cada teste aqui é um desses bugs, fixado: se a regra voltar a quebrar, o
 * teste quebra antes de chegar na tela.
 */
import { describe, it, expect } from "vitest";
import {
  calcularAdiarAte,
  diasDoNaoAgora,
  contarNaoAgoraSeguidos,
  diasAteVoltar,
  hojeMais,
  diaEmSP,
  inicioDoDiaSP,
  NAO_AGORA_PRIMEIRO,
  NAO_AGORA_TETO,
} from "./contato-regras";
import {
  temAgenda,
  hojeEhDiaDeContato,
  rotuloAgenda,
  proximoDiaDaAgenda,
  diaDaSemana,
} from "./rota-regras";

describe('escada do "não agora"', () => {
  it("primeiro vale pouco, repetição é que pesa", () => {
    expect(diasDoNaoAgora(0)).toBe(3);
    expect(diasDoNaoAgora(1)).toBe(6);
    expect(diasDoNaoAgora(2)).toBe(12);
    expect(diasDoNaoAgora(3)).toBe(24);
  });

  it("para no teto e não cresce pra sempre", () => {
    expect(diasDoNaoAgora(4)).toBe(NAO_AGORA_TETO);
    expect(diasDoNaoAgora(50)).toBe(NAO_AGORA_TETO);
  });

  it("nunca some com o cliente por mais que o teto", () => {
    for (let n = 0; n < 100; n++) {
      expect(diasDoNaoAgora(n)).toBeLessThanOrEqual(NAO_AGORA_TETO);
      expect(diasDoNaoAgora(n)).toBeGreaterThanOrEqual(NAO_AGORA_PRIMEIRO);
    }
  });

  it("conta só a sequência do topo — outra resposta no meio zera", () => {
    expect(contarNaoAgoraSeguidos(["nao_agora", "nao_agora", "comprou"])).toBe(2);
    expect(contarNaoAgoraSeguidos(["comprou", "nao_agora", "nao_agora"])).toBe(0);
    expect(contarNaoAgoraSeguidos([])).toBe(0);
    expect(contarNaoAgoraSeguidos([null, "nao_agora"])).toBe(0);
  });
});

describe("data de retorno", () => {
  it("data escolhida à mão ganha do cálculo automático", () => {
    expect(calcularAdiarAte("nao_agora", 7, "2026-12-25", 0)).toBe("2026-12-25");
    expect(calcularAdiarAte("sem_resposta", null, "2026-12-25")).toBe("2026-12-25");
  });

  it('"comprou" volta antes do ciclo, pra falar antes do estoque acabar', () => {
    expect(diasAteVoltar(7)).toBe(4);
    expect(diasAteVoltar(30)).toBe(27);
  });

  it("ciclo curto não joga o retorno pro passado", () => {
    expect(diasAteVoltar(1)).toBeGreaterThanOrEqual(1);
    expect(diasAteVoltar(2)).toBeGreaterThanOrEqual(1);
    expect(diasAteVoltar(3)).toBeGreaterThanOrEqual(1);
  });

  it("sem ciclo conhecido usa o padrão, não trava", () => {
    expect(diasAteVoltar(null)).toBeGreaterThan(0);
  });

  it("nenhum resultado silencia o cliente por mais de um mês sozinho", () => {
    for (const r of ["vai_comprar", "nao_agora", "sem_resposta", "comprou"]) {
      const ate = calcularAdiarAte(r, 7, null, 0);
      if (!ate) continue;
      const limite = hojeMais(31);
      expect(ate <= limite).toBe(true);
    }
  });
});

describe("agenda de contato do cliente", () => {
  // 2026-09-28 é segunda, 29 terça, 01/10 quinta.
  it("sabe o dia da semana no fuso de Porto Alegre", () => {
    expect(diaDaSemana("2026-09-28")).toBe(1);
    expect(diaDaSemana("2026-09-29")).toBe(2);
    expect(diaDaSemana("2026-10-01")).toBe(4);
    expect(diaDaSemana("2026-10-04")).toBe(7);
  });

  it("aparece nos dias marcados e só neles", () => {
    const dias = [1, 2, 4]; // seg, ter, qui
    expect(hojeEhDiaDeContato(dias, "2026-09-28")).toBe(true);
    expect(hojeEhDiaDeContato(dias, "2026-09-29")).toBe(true);
    expect(hojeEhDiaDeContato(dias, "2026-09-30")).toBe(false);
    expect(hojeEhDiaDeContato(dias, "2026-10-01")).toBe(true);
  });

  it("sem agenda não vira agenda vazia", () => {
    expect(temAgenda(null)).toBe(false);
    expect(temAgenda([])).toBe(false);
    expect(hojeEhDiaDeContato(null, "2026-09-28")).toBe(false);
    expect(rotuloAgenda(null)).toBeNull();
  });

  it("mostra os dias na ordem da semana, não na ordem do clique", () => {
    expect(rotuloAgenda([4, 1, 2])).toBe("seg · ter · qui");
  });

  it("sabe dizer quando o cliente volta, inclusive virando a semana", () => {
    expect(proximoDiaDaAgenda([1, 2, 4], "2026-09-29")).toBe("quinta");
    expect(proximoDiaDaAgenda([1, 2, 4], "2026-10-02")).toBe("segunda");
  });
});

describe("o dia certo", () => {
  it("o corte do dia é meia-noite de Porto Alegre, não de Londres", () => {
    // 21h em Porto Alegre = meia-noite UTC do dia seguinte. O dia tem que
    // continuar sendo o de cá, senão o placar zera no meio do expediente.
    expect(diaEmSP("2026-09-29T23:30:00-03:00")).toBe("2026-09-29");
    expect(diaEmSP("2026-09-30T02:00:00Z")).toBe("2026-09-29");
  });

  it("início do dia carrega o fuso, senão pega desde as 21h da véspera", () => {
    expect(inicioDoDiaSP("2026-09-29")).toBe("2026-09-29T00:00:00-03:00");
    expect(new Date(inicioDoDiaSP("2026-09-29")).toISOString()).toBe(
      "2026-09-29T03:00:00.000Z"
    );
  });
});
