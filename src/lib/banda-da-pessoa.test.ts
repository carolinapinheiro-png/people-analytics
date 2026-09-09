import test from 'node:test';
import assert from 'node:assert/strict';
import { bandaDaPessoa } from '@/lib/banda-da-pessoa';

const base = { vinculo: 'CLT', level: 'L4' };

test('as oito famílias diretas resolvem sozinhas', () => {
  const casos: Array<[string, string]> = [
    ['Customer Operations', 'CUSTOMER SERVICE'],
    ['Product & Technology', 'TECH'],
    ['Data & Analytics', 'TECH'],
    ['Finance', 'CORPORATE'],
    ['HR', 'CORPORATE'],
    ['Legal', 'CORPORATE'],
    ['Other (Property, Security, Cleaning)', 'CORPORATE'],
    ['Risk and Trading', 'COMMERCIAL'],
  ];
  for (const [fam, esperada] of casos) {
    assert.equal(bandaDaPessoa({ ...base, jobTypeFamily: fam }).familia, esperada, fam);
  }
});

test('Commercial & Marketing se separa pelo departamento', () => {
  const c = { ...base, jobTypeFamily: 'Commercial & Marketing' };
  assert.equal(bandaDaPessoa({ ...c, department: 'COMMERCIAL' }).familia, 'COMMERCIAL');
  assert.equal(bandaDaPessoa({ ...c, department: 'MARKETING' }).familia, 'MARKETING/COM');
});

test('Commercial & Marketing em outro departamento NÃO chuta banda', () => {
  // 152 pessoas dependem desta regra. Escolher uma das duas por desempate
  // arbitrário poria gente na faixa errada, e a tela não teria como saber.
  const r = bandaDaPessoa({ ...base, jobTypeFamily: 'Commercial & Marketing', department: 'PORTO' });
  assert.equal(r.familia, null);
  assert.match(r.motivo!, /COMMERCIAL nem MARKETING/);
});

test('liderança usa a banda da área, e o level diferencia', () => {
  const lider = 'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)';
  assert.equal(
    bandaDaPessoa({ ...base, level: 'L8', jobTypeFamily: lider, department: 'TECHNOLOGY' }).familia,
    'TECH',
  );
  assert.equal(
    bandaDaPessoa({ ...base, level: 'L8', jobTypeFamily: lider, department: 'FINANCE' }).familia,
    'CORPORATE',
  );
});

test('liderança em área sem banda não inventa uma', () => {
  const lider = 'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)';
  const r = bandaDaPessoa({ ...base, jobTypeFamily: lider, department: 'DIRETORIA' });
  assert.equal(r.familia, null);
});

test('vínculo sem banda é motivo, não ausência de dado', () => {
  // "Aprendiz não tem faixa" e "não sei a faixa dele" são coisas diferentes, e
  // a segunda já apareceu como a primeira neste painel.
  for (const v of ['Aprendiz', 'Diretor Estatutário', 'Associado', 'Sócio']) {
    const r = bandaDaPessoa({ jobTypeFamily: 'Finance', level: 'L4', vinculo: v });
    assert.equal(r.familia, null);
    assert.match(r.motivo!, /só para CLT e PJ/);
  }
});

test('sem level não há banda, e o motivo diz isso', () => {
  const r = bandaDaPessoa({ jobTypeFamily: 'Finance', vinculo: 'CLT', level: null });
  assert.equal(r.familia, null);
  assert.match(r.motivo!, /level/i);
});

test('sem família o motivo aponta a unificação de bases', () => {
  const r = bandaDaPessoa({ ...base, jobTypeFamily: null, department: 'TECHNOLOGY' });
  assert.equal(r.familia, null);
  assert.match(r.motivo!, /unifica/i);
});

test('quem resolve devolve os três campos da chave da banda', () => {
  const r = bandaDaPessoa({
    jobTypeFamily: 'Product & Technology', vinculo: 'Pessoa Jurídica', level: 'L5',
  });
  assert.deepEqual(
    { familia: r.familia, contrato: r.contrato, level: r.level },
    { familia: 'TECH', contrato: 'PJ', level: 'L5' },
  );
  assert.equal(r.motivo, null);
});
