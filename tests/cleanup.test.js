'use strict';
// Los tests no dejan temporales: una corrida de la suite dejaba ~240 carpetas
// pignolo-* en %TEMP% (y una auditoría, ~112.000). Todo temporal sale de
// makeTempDir (tests/helpers.js), que los borra al salir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');

const HELPERS = path.join(__dirname, 'helpers.js');
// Armada por partes para que este archivo no se nombre a sí mismo.
const OWN_TEMP = new RegExp(['mk', 'dtemp|tmp', 'dir\\('].join(''));

test('no test file creates temporary directories except through tests/helpers.js', () => {
  for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.js') && x !== 'helpers.js')) {
    const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.doesNotMatch(text, OWN_TEMP, f);
  }
});

// Protects: limpieza de temporales · Breaks if: makeTempDir deja de registrar lo que
// crea o nadie lo borra al salir, también con una siembra en segundo plano viva.
test('a test file that uses every helper leaves no pignolo-* directory behind', async () => {
  const tmp = makeTempDir('pignolo-cleanup-');
  const fixture = path.join(tmp, 'fixture.test.js');
  fs.writeFileSync(fixture, [
    "'use strict';",
    "const test = require('node:test');",
    `const h = require(${JSON.stringify(HELPERS)});`,
    "test('uses the helpers', () => {",
    '  h.makeTempDir();',
    '  const repo = h.makeRepo();',
    "  h.runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo, session_id: 's' });",
    "  h.runLauncher('session-start', { hook_event_name: 'SessionStart', source: 'startup', cwd: repo, session_id: 's' });",
    '});',
    '',
  ].join('\n'));
  // Sin NODE_TEST_CONTEXT: con él, el `node --test` hijo no corre como una suite propia.
  const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', fixture], { cwd: tmp, env, encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const left = () => fs.readdirSync(tmp).filter((x) => x.startsWith('pignolo-'));
  const end = Date.now() + 70000;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  while (left().length && Date.now() < end) await sleep(500);
  assert.deepStrictEqual(left(), []);
  await sleep(6000); // la siembra en segundo plano no vuelve a crear nada
  assert.deepStrictEqual(left(), []);
});
