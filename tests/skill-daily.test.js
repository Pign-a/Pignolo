'use strict';
// Forma de la skill daily (hito 3b): el orden de 3a y las reglas de cada escritor.
const test = require('node:test');
const assert = require('node:assert');
const { readSkill, brokenReferences } = require('./skill-forms');

test('daily: frontmatter invocable por el modelo (D-3b-2), entrada por pignolo:entry y referencias reales', () => {
  const s = readSkill('daily');
  assert.strictEqual(s.data.name, 'daily');
  assert.strictEqual(s.data['disable-model-invocation'], undefined);
  assert.match(s.data.description, /pignolo:entry/);
  assert.deepStrictEqual(brokenReferences(s.text), []);
});

test('daily: orden de 3a (task del test-writer, rojo, testRef, implementer) hasta el merge', () => {
  const { text } = readSkill('daily');
  const order = [
    /run\.js" start --flow daily/,
    /git worktree add -b task\/daily\/<YYYY-MM-DD>-<slug> "<main>\/\.pignolo\/worktrees\/<slug>"/,
    /--agent pignolo:test-writer/,
    /Prove red yourself/,
    /--test-ref <T>[^\n]*--agent pignolo:implementer/,
    /risk\.js" --diff <base>/,
    /pignolo:review/,
    /git merge --no-ff -F/,
    /run\.js" end/,
  ];
  let at = 0;
  for (const re of order) {
    const m = re.exec(text.slice(at));
    assert.ok(m, `falta o está fuera de orden: ${re}`);
    at += m.index + m[0].length;
  }
});

test('daily: status tras cada escritor, re-registro, renew, barras normales, modelos y categorías', () => {
  const { text } = readSkill('daily');
  for (const re of [/run\.js" status/, /handback\.accepted/, /At most 2 automatic continuations/, /register the task again/,
    /run\.js" renew/, /uses `\/`/, /setup\.js" models/, /templates\/task-card\.md/, /category `irreversible`/]) {
    assert.match(text, re);
  }
});

// Revisión final 3b (4): con type docs|script no hay tarea ni <T> al llegar al paso 9.
test('daily: si se saltearon los pasos 5 a 8, el implementer se registra con --worktree y --base y sin --test-ref', () => {
  const { text } = readSkill('daily');
  assert.match(text, /If you skipped steps 5 to 8[^\n]*run\.js" task --id <slug> --worktree "<wt>" --base <base> --file <source path>[^\n]*--agent pignolo:implementer --cwd "<main>"`[^\n]*without `--test-ref`/);
});

// Revisión final 3b (16): live-check (§9) no está construido; el merge lo avisa.
test('daily: el paso del merge avisa que live-check no corrió si project.md lo declara', () => {
  const { text } = readSkill('daily');
  assert.match(text, /\*\*Merge\*\*[^\n]*gates\.live-check[^\n]*not run/);
});

// Confirmación 3b (B): trivial manda a daily con el árbol sucio; el merge no debe chocar con trabajo del humano.
test('daily: antes del merge mira el árbol de <main>; con cambios del humano no mergea ni hace stash ni commit', () => {
  const { text } = readSkill('daily');
  assert.match(text, /\*\*Merge\*\*[^\n]*cd "<main>" && git status --porcelain[^\n]*do not merge[^\n]*category `scope`[^\n]*never stash or commit their work/);
});

// Hito 4b: test-card, rojo por sabotaje sobre código commiteado por el implementer, semilla y sin holdout.
test('daily: Test-card por test, rojo test-first y sabotage.js después del commit del implementer (no antes)', () => {
  const { text } = readSkill('daily');
  const order = [
    /one `Test-card` block per test/,
    /Prove red yourself/,
    /git commit -F "<main>\/\.pignolo\/tmp\/commit-msg\.txt"`\. Call the new `git rev-parse HEAD` `<T>`/,
    /--test-ref <T>[^\n]*--agent pignolo:implementer/,
    /`Agent: pignolo:implementer` and `Gates: on-done PASS`/,
    /node "<P>\/scripts\/sabotage\.js" --patch "<main>\/\.pignolo\/tmp\/sabotage-<slug>-<n>\.patch" --gate on-done --cwd "<wt>" --timeout-min 4/,
    /Invoke the `pignolo:review` skill/,
  ];
  let at = 0;
  for (const re of order) {
    const m = re.exec(text.slice(at));
    assert.ok(m, `falta o está fuera de orden: ${re}`);
    at += m.index + m[0].length;
  }
  // F1: sin sabotaje antes de que el implementer commitee (los tests test-first siguen rojos y sabotage.js sale con 2).
  assert.strictEqual(text.indexOf('sabotage.js" --patch'), text.lastIndexOf('sabotage.js" --patch'));
  assert.ok(text.indexOf('sabotage.js" --patch') > text.indexOf('Agent: pignolo:implementer'));
  assert.match(text, /`Red is proved by: sabotage`[^\n]*passes here[^\n]*step 12/);
  assert.match(text, /one `@@` hunk[^\n]*one line of context above and below/);
});

test('daily: lectura del exit de sabotage.js (no-veredictos, plazo en Bash, recuperación)', () => {
  const { text } = readSkill('daily');
  assert.match(text, /`timeout` set to 600000/);
  assert.match(text, /- exit 0: red proved/);
  // F3: timedOut y greenBefore:false no son veredicto y nunca se le achacan al parche.
  assert.match(text, /- exit 1 with `timedOut: true`, or exit 2 with `greenBefore: false`[^\n]*not a verdict and never the patch's fault[^\n]*`--timeout-min <minutes the suite needs>`/);
  assert.match(text, /- exit 1 otherwise: the test stayed green with the break/);
  assert.match(text, /- exit 2 with `refused: patch`[^\n]*fix the patch once/);
  // Hallazgo final 1: el exit 2 sin `refused: patch` ni `greenBefore: false` no es veredicto: se muestra y se pregunta.
  assert.match(text, /- exit 2 without `refused: patch` and without `greenBefore: false`[^\n]*not a verdict[^\n]*ask the human[^\n]*never rewrite the patch/);
  // Hallazgo final 4: newFiles, --recover con exit 2, --cwd en el task del test-writer y el brief del rewrite.
  assert.match(text, /non-empty `newFiles`[^\n]*show them to the human and ask/);
  assert.match(text, /--recover --cwd "<wt>"` before anything else; if that exits 2[^\n]*wait and run it again/);
  assert.match(text, /--agent pignolo:test-writer --cwd "<main>"`, renew first/);
  assert.match(text, /you wrote this test in this task; rewrite it/);
  assert.match(text, /- exit 3: the script could not restore the code/);
  // F4: si Bash mató la corrida, recuperar antes de todo.
  assert.match(text, /sabotage\.js" --recover --cwd "<wt>"` before anything else/);
});

test('daily: semilla (seedOffered, --seed, nunca repetir hasta verde) y el holdout no es de daily', () => {
  const { text } = readSkill('daily');
  assert.match(text, /\*\*Seed\.\*\*[^\n]*`seedOffered`[^\n]*--seed <seedOffered>[^\n]*never rerun until green/);
  assert.doesNotMatch(text, /holdout\.js/);
});
