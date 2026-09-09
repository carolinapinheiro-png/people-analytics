import test from 'node:test';
import assert from 'node:assert/strict';
import { movimentacoesPorMes, type MovimentoSalarial } from './movimentacoes';

const r = (
  conveniaId: string, vigencia: string, motivo: string | null, salario: number | null,
): MovimentoSalarial => ({ conveniaId, vigencia, motivo, salario });

test('promoção conta PESSOA, e duas no mesmo mês contam uma', () => {
  // Duas correções lançadas no mesmo mês para a mesma pessoa são um evento de
  // carreira. É a regra que o WIL já usa; a série congelada conta registros, e
  // essa divergência está declarada no cabeçalho do módulo.
  const m = movimentacoesPorMes([
    r('1', '2026-03-01', 'Admissão', 5000),
    r('1', '2026-03-10', 'Promoção', 6000),
    r('1', '2026-03-20', 'Promoção', 6200),
    r('2', '2026-03-05', 'Promoção', 8000),
  ]);
  assert.equal(m.get('2026-03')!.promotions, 2, 'duas pessoas, não três registros');
});

test('o delta é contra o salário anterior DA PESSOA, não contra zero', () => {
  const m = movimentacoesPorMes([
    r('1', '2026-01-01', 'Admissão', 5000),
    r('1', '2026-02-01', 'Mérito/Reajuste', 5500),
    r('2', '2026-02-01', 'Admissão', 9000),
  ]);
  const fev = m.get('2026-02')!;
  // 500, e não 5500. Sem ordenar por pessoa e por data, o total do mês viraria
  // a folha inteira em vez do reajuste.
  assert.equal(fev.raise_events.merito.delta, 500);
  assert.equal(fev.raise_events.merito.n, 1, 'a admissão de outra pessoa não é reajuste');
});

test('admissão não é evento de reajuste', () => {
  const m = movimentacoesPorMes([r('1', '2026-01-01', 'Admissão', 5000)]);
  assert.equal(m.size, 0, 'mês sem movimento não vira chave');
});

test('dissídio e acordo coletivo caem no mesmo balde; mérito e reajuste também', () => {
  // A classificação é importada da série reconstruída de propósito -- uma
  // segunda cópia divergiria com o tempo, e a divergência apareceria como "o
  // painel e o WIL discordam".
  const m = movimentacoesPorMes([
    r('1', '2026-01-01', 'Admissão', 1000),
    r('1', '2026-05-01', 'Dissídio', 1100),
    r('2', '2026-01-01', 'Admissão', 1000),
    r('2', '2026-05-01', 'Acordo coletivo', 1050),
    r('3', '2026-01-01', 'Admissão', 1000),
    r('3', '2026-05-01', 'Reajuste', 1200),
  ]);
  const mai = m.get('2026-05')!;
  assert.equal(mai.raise_events.dissidio.n, 2);
  assert.equal(mai.raise_events.dissidio.delta, 150);
  assert.equal(mai.raise_events.merito.n, 1);
  assert.equal(mai.raise_events.merito.delta, 200);
});

test('promoção também entra em raise_events, com o valor', () => {
  // As duas leituras convivem: "quantas pessoas subiram" e "quanto custou".
  const m = movimentacoesPorMes([
    r('1', '2026-01-01', 'Admissão', 10000),
    r('1', '2026-06-01', 'Promoção', 13000),
  ]);
  const jun = m.get('2026-06')!;
  assert.equal(jun.promotions, 1);
  assert.equal(jun.raise_events.promocao.n, 1);
  assert.equal(jun.raise_events.promocao.delta, 3000);
});

test('sem salário anterior conhecido, o evento NÃO entra com delta cheio', () => {
  // A carga lê o histórico em lotes: pode chegar um "Mérito" sem a admissão
  // que veio antes. Contar o evento aí daria um reajuste do tamanho do salário
  // -- número enorme, plausível na tela, e errado.
  const m = movimentacoesPorMes([r('1', '2026-04-01', 'Mérito/Reajuste', 7000)]);
  assert.equal(m.size, 0);
});

test('motivo desconhecido não vira mérito por descuido', () => {
  // "Alteração de função" é mudança lateral, e a Convenia já separou as duas
  // coisas. Inferir promoção daí seria desrespeitar quem preencheu.
  const m = movimentacoesPorMes([
    r('1', '2026-01-01', 'Admissão', 5000),
    r('1', '2026-02-01', 'Alteração de função', 5000),
    r('1', '2026-03-01', 'Mudança de jornada', 4000),
  ]);
  assert.equal(m.size, 0);
});

test('vigência em dd/mm/aaaa é entendida igual à ISO', () => {
  const m = movimentacoesPorMes([
    r('1', '2026-01-01', 'Admissão', 1000),
    r('1', '15/07/2026', 'Promoção', 1500),
  ]);
  assert.equal(m.get('2026-07')!.promotions, 1);
});

test('registro sem data é ignorado, e não atribuído a um mês qualquer', () => {
  const m = movimentacoesPorMes([
    { conveniaId: '1', vigencia: null, motivo: 'Promoção', salario: 9000 },
  ]);
  assert.equal(m.size, 0);
});
