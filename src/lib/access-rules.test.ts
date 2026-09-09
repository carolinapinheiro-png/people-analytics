import test from 'node:test';
import assert from 'node:assert/strict';
import { SubTabsSchema, ExtraTabsSchema } from '@/lib/access-rules';
import { ALL_TABS, SUB_ABAS_DO_PRODUTO } from '@/lib/permissions';

// ===========================================================================
// OS SCHEMAS SEGUEM O PRODUTO, E NAO UMA COPIA DELE
// ===========================================================================
// `SubTabsSchema` tinha seis valores enquanto o produto tinha oito. A tela
// oferecia `desligamentos` e `nao-desejada`, o servidor recusava, e o cadastro
// falhava com "invalid enum value" -- que quem esta cadastrando le como erro
// proprio.
//
// Estes testes quebram no dia em que uma aba ou sub-aba nova entrar em
// `permissions.ts` sem entrar na validacao, que e o unico jeito de isso nao
// acontecer de novo.

test('toda sub-aba do produto passa na validacao do cadastro', () => {
  const todas = Object.keys(SUB_ABAS_DO_PRODUTO);
  const r = SubTabsSchema.safeParse(todas);
  assert.ok(r.success, `sub-abas recusadas: ${JSON.stringify(r.error?.issues)}`);
});

test('as duas sub-abas de Atricao entram -- foi o caso que quebrou', () => {
  assert.ok(SubTabsSchema.safeParse(['desligamentos', 'nao-desejada']).success);
});

test('sub-aba inventada continua sendo recusada', () => {
  // A lista segue FECHADA: derivar nao e afrouxar.
  assert.equal(SubTabsSchema.safeParse(['nao-existe']).success, false);
});

test('toda aba do produto passa na validacao do cadastro', () => {
  const r = ExtraTabsSchema.safeParse([...ALL_TABS]);
  assert.ok(r.success, `abas recusadas: ${JSON.stringify(r.error?.issues)}`);
});

test('aba inventada continua sendo recusada', () => {
  assert.equal(ExtraTabsSchema.safeParse(['nao-existe']).success, false);
});
