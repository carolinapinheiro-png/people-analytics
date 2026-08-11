/**
 * Testes da leitura e validação das credenciais do InHire.
 *
 *   npx tsc src/lib/inhire/auth.server.ts src/lib/inhire/creds.test.ts \
 *     --outDir /tmp/ihcreds --module commonjs --target es2020 --strict \
 *     --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/ihcreds/creds.test.js
 *
 * ESTE ARQUIVO EXISTE POR CAUSA DE UM ERRO REAL. A primeira tentativa de
 * conectar voltou "HTTP 400" e a mensagem mandava conferir se o usuário de API
 * estava ativo -- ou seja, apontava para credencial quando 400 é requisição
 * malformada. O InHire valida formato de e-mail e tamanho de senha; um espaço
 * colado junto reprova as duas coisas.
 *
 * Checar antes de sair da máquina transforma um 400 remoto e mudo numa frase
 * que diz o que arrumar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCreds } from './auth.server';

function comEnv(vals: Record<string, string | undefined>, fn: () => void) {
  const antes = {
    INHIRE_API_EMAIL: process.env.INHIRE_API_EMAIL,
    INHIRE_API_PASSWORD: process.env.INHIRE_API_PASSWORD,
    INHIRE_TENANT: process.env.INHIRE_TENANT,
  };
  Object.entries(vals).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  try { fn(); } finally {
    Object.entries(antes).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }
}

const VALIDO = {
  INHIRE_API_EMAIL: 'api-user@flutterbrazil.inhire.app',
  INHIRE_API_PASSWORD: 'umaSenhaSuficientementeLonga123',
  INHIRE_TENANT: 'flutterbrazil',
};

test('credenciais válidas passam', () => {
  comEnv(VALIDO, () => {
    const c = readCreds();
    assert.equal(c.tenant, 'flutterbrazil');
    assert.equal(c.email, 'api-user@flutterbrazil.inhire.app');
  });
});

test('espaço e quebra de linha colados junto são removidos', () => {
  // A causa mais provável do 400 real: copiar e colar traz espaço invisível.
  comEnv({
    ...VALIDO,
    INHIRE_API_EMAIL: '  api-user@flutterbrazil.inhire.app\n',
    INHIRE_API_PASSWORD: ' umaSenhaSuficientementeLonga123 ',
    INHIRE_TENANT: 'flutterbrazil\n',
  }, () => {
    const c = readCreds();
    assert.equal(c.email, 'api-user@flutterbrazil.inhire.app');
    assert.equal(c.password, 'umaSenhaSuficientementeLonga123');
    assert.equal(c.tenant, 'flutterbrazil');
  });
});

test('aspas em volta do valor são removidas', () => {
  comEnv({ ...VALIDO, INHIRE_TENANT: '"flutterbrazil"' }, () => {
    assert.equal(readCreds().tenant, 'flutterbrazil');
  });
});

test('e-mail sem formato de e-mail falha ANTES de chamar a API', () => {
  comEnv({ ...VALIDO, INHIRE_API_EMAIL: 'nao-e-email' }, () => {
    assert.throws(() => readCreds(), (e: Error) => {
      assert.match(e.message, /não parece um e-mail válido/);
      // O 400 precisa ser nomeado: sem isso a pessoa investiga rede e token.
      assert.match(e.message, /HTTP 400/);
      return true;
    });
  });
});

test('senha curta demais falha com o limite explícito', () => {
  comEnv({ ...VALIDO, INHIRE_API_PASSWORD: 'abc' }, () => {
    assert.throws(() => readCreds(), (e: Error) => {
      assert.match(e.message, /3 caracteres/);
      assert.match(e.message, /entre 6 e 64/);
      return true;
    });
  });
});

test('senha longa demais também falha', () => {
  comEnv({ ...VALIDO, INHIRE_API_PASSWORD: 'x'.repeat(65) }, () => {
    assert.throws(() => readCreds(), /65 caracteres/);
  });
});

test('a mensagem de erro NUNCA contém a senha', () => {
  const senha = 'SenhaSecretaQueNaoPodeVazar123';
  comEnv({ ...VALIDO, INHIRE_API_EMAIL: 'invalido', INHIRE_API_PASSWORD: senha }, () => {
    assert.throws(() => readCreds(), (e: Error) => {
      assert.equal(e.message.includes(senha), false, 'a senha vazou na mensagem de erro');
      return true;
    });
  });
});

test('tenant com espaço no meio é recusado', () => {
  comEnv({ ...VALIDO, INHIRE_TENANT: 'flutter brazil' }, () => {
    assert.throws(() => readCreds(), /não pode ter espaço/);
  });
});

test('variável faltando diz exatamente qual', () => {
  comEnv({ ...VALIDO, INHIRE_API_PASSWORD: undefined }, () => {
    assert.throws(() => readCreds(), (e: Error) => {
      assert.match(e.message, /INHIRE_API_PASSWORD/);
      assert.equal(e.message.includes('INHIRE_API_EMAIL'), false, 'não deve acusar as que existem');
      return true;
    });
  });
});

test('secret preenchido só com espaço conta como faltando', () => {
  comEnv({ ...VALIDO, INHIRE_TENANT: '   ' }, () => {
    assert.throws(() => readCreds(), /INHIRE_TENANT/);
  });
});
