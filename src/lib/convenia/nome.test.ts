import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeCompleto, soPrimeiroNome } from './sync.server';

/**
 * O nome é a única ponte entre a folha de remuneração e o Convenia.
 *
 * Estes testes existem porque a regressão aqui é MUDA nos dois sentidos: o
 * nome sai errado, nada quebra, e o sintoma aparece longe -- linhas sem
 * camada na aba de Salários. Duas versões seguidas desta função devolveram
 * zero casamentos em 606 linhas, por motivos opostos, e o número na tela foi
 * o mesmo nas duas.
 */

test('o Convenia real: `name` é o primeiro nome e `last_name` é o resto', () => {
  // O caso observado em produção. "Tiago Albineli Motta" na folha chegava
  // como "Albineli Motta" -- dois termos, um espaço, e truncado pela frente.
  assert.equal(
    nomeCompleto({ name: 'Tiago', last_name: 'Albineli Motta' }),
    'Tiago Albineli Motta',
  );
});

test('full_name só vale se começar pelo primeiro nome', () => {
  // Se `full_name` vier truncado, "tem espaço" o aprovaria. Não basta.
  assert.equal(
    nomeCompleto({ name: 'Tiago', full_name: 'Albineli Motta', last_name: 'Albineli Motta' }),
    'Tiago Albineli Motta',
  );
  assert.equal(
    nomeCompleto({ name: 'Tiago', full_name: 'Tiago Albineli Motta' }),
    'Tiago Albineli Motta',
  );
});

test('a comparação ignora acento e caixa', () => {
  // A folha veio de planilha ("Alvaro"); o Convenia manda "Álvaro". Sem
  // normalizar, `full_name` seria recusado e o nome montado em dobro.
  assert.equal(
    nomeCompleto({ name: 'Álvaro', full_name: 'Alvaro Garcia Junior' }),
    'Alvaro Garcia Junior',
  );
});

test('não duplica quando last_name já traz o primeiro nome', () => {
  // Concatenar sem olhar produziria "Tiago Tiago Albineli Motta".
  assert.equal(
    nomeCompleto({ name: 'Tiago', last_name: 'Tiago Albineli Motta' }),
    'Tiago Albineli Motta',
  );
});

test('usa first_name quando ele existe, e name como reserva', () => {
  assert.equal(
    nomeCompleto({ first_name: 'Ana', middle_name: 'Maria', last_name: 'Costa' }),
    'Ana Maria Costa',
  );
  assert.equal(nomeCompleto({ name: 'João', last_name: 'Pereira' }), 'João Pereira');
});

test('cai para o primeiro nome sozinho em vez de perder a pessoa', () => {
  // Sem sobrenome ela não casa com a folha, mas continua no organograma --
  // e é da camada N que depende o acesso à aba de Salários.
  assert.equal(nomeCompleto({ name: 'Kauan' }), 'Kauan');
});

test('devolve null quando não há nada, e não string vazia', () => {
  // "" viraria chave vazia no vínculo, e duas chaves vazias casariam entre
  // si -- exatamente o "casar errado" que vinculo-comp existe para evitar.
  assert.equal(nomeCompleto({}), null);
  assert.equal(nomeCompleto({ name: '   ' }), null);
});

test('colapsa espaço repetido, que viraria chave diferente', () => {
  assert.equal(nomeCompleto({ name: 'Ana', last_name: 'Costa  Silva' }), 'Ana Costa Silva');
});

test('conta quantos vieram sem sobrenome, ignorando nulos', () => {
  assert.equal(soPrimeiroNome(['Ana Costa', 'João', null, 'Kauan', 'Rafael Moraes']), 2);
});
