// Lenguaje natural (decisión del autor, 2026-10-03): las cuatro skills se activan con una frase normal,
// no solo con /comando. Protege: description que dice cuándo usarla, sin disable-model-invocation y
// confirmación con AskUserQuestion como primer paso cuando la skill se activó sola.
// Se rompe si: alguien vuelve a poner disable-model-invocation, la description deja de empezar por
// "Use when the user asks to", se pasa del tope de 1536 caracteres o el primer paso no pregunta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkill, readReference, referencedFiles } from './support/skill-checks.mjs';

const SKILLS = ['new', 'improve', 'audit', 'define'];

// El primer paso numerado de "## Steps": desde "0." o "1." hasta el siguiente.
function firstStep(body) {
  const steps = body.slice(body.indexOf('## Steps'));
  const m = /^(\d+)\. \*\*[\s\S]*?(?=^\d+\. \*\*|^## )/m.exec(steps);
  assert.ok(m, 'no step found');
  return m[0];
}

for (const name of SKILLS) {
  test(`${name}: the model may invoke it and its description says when to use it`, () => {
    const { frontmatter } = readSkill(name);
    assert.equal(frontmatter['disable-model-invocation'], undefined);
    assert.match(frontmatter.description, /^"Use when the user asks to /);
    const d = frontmatter.description.slice(1, -1);
    assert.ok(d.length <= 1536, `${d.length} characters`);
    assert.match(d, /'[^']+'/, 'typical phrases between quotes');
    assert.match(d, /Do not use|Not for/);
  });

  test(`${name}: the first step asks with AskUserQuestion when the skill was not typed as a command`, () => {
    const { body } = readSkill(name);
    const step = firstStep(body);
    assert.match(step, /^0\. /);
    for (const lit of ['AskUserQuestion', 'recommended', 'activation.md', 'Hacerlo directo', '<command-name>']) assert.ok(step.includes(lit), lit);
    assert.ok(referencedFiles(step).includes('activation.md'));
  });
}

test('activation.md holds the shared rules and a cost line for each skill', () => {
  const ref = readReference('activation.md');
  assert.ok(!ref.includes('${'));
  for (const lit of ['AskUserQuestion', 'Hacerlo directo', 'End this skill', '<command-name>']) assert.ok(ref.includes(lit), lit);
  for (const name of SKILLS) assert.ok(ref.includes(`### ${name}`), name);
});
