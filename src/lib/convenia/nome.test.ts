import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeCompleto, soPrimeiroNome } from './sync.server';

/**
 * O nome é a única ponte entre a folha de remuneração e o Convenia.
 *
 * Sem estes testes, a regressão é muda: o fallback devolve o primeiro nome,
 * nada quebra, e o sintoma aparece longe daqui -- linhas sem camada na aba de
 * Salários, e o cruzamento de promoção com gênero e etnia perdendo gente.
 */

test('prefere full_name quando ele tem sobrenome', () => {
  assert.equal(
    nomeCompleto({ name: 'Bárbara', full_name: 'Bárbara Silva Santos' }),
    'Bárbara Silva Santos',
  );
});

test('ignora full_name que veio só com o primeiro nome', () => {
  // O caso que quebrou: os dois campos trazendo a mesma coisa. Aceitar
  // "Bárbara" como completo devolveria o mesmo bug com outro nome.
  assert.equal(
    nomeCompleto({
      name: 'Bárbara', full_name: 'Bárbara', first_name: 'Bárbara', last_name: 'Silva',
    }),
    'Bárbara Silva',
  );
});

test('monta de first_name e last_name quando não há full_name', () => {
  assert.equal(nomeCompleto({ first_name: 'João', last_name: 'Pereira' }), 'João Pereira');
  assert.equal(
    nomeCompleto({ first_name: 'Ana', middle_name: 'Maria', last_name: 'Costa' }),
    'Ana Maria Costa',
  );
});

test('cai para o primeiro nome em vez de perder a pessoa', () => {
  // Sem sobrenome ela não casa com a folha, mas continua no organograma.
  assert.equal(nomeCompleto({ name: 'Kauan' }), 'Kauan');
});

test('devolve null quando não há nada, e não string vazia', () => {
  // "" viraria chave vazia no vínculo, e duas chaves vazias casariam entre si
  // -- que é exatamente o "casar errado" que vinculo-comp existe para evitar.
  assert.equal(nomeCompleto({}), null);
  assert.equal(nomeCompleto({ name: '   ' }), null);
});

test('conta quantos vieram sem sobrenome, ignorando nulos', () => {
  assert.equal(soPrimeiroNome(['Ana Costa', 'João', null, 'Kauan', 'Rafael Moraes']), 2);
});
