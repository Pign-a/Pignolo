// Revisión opus de la rama fix/fuga-leak-values (2026-10-03), RL-01: ningún archivo de la corrida (bajo
// .pignolo-ui/, que un `git add -f` puede meter al historial) guarda la ruta absoluta del proyecto, que lleva la
// carpeta personal y el usuario del sistema cuando el proyecto vive bajo el home (el caso normal).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, runScript } from './helpers.mjs';

test('RL-01: run.json de una corrida nueva no guarda la ruta absoluta del proyecto', () => {
  const project = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: project });
  fs.writeFileSync(path.join(project, 'README.md'), 'x\n');
  const init = runScript('run.mjs', ['init', '--project', project, '--command', 'new', '--slug', 'x']);
  assert.equal(init.status, 0, init.stderr);
  const text = fs.readFileSync(path.join(init.json.run, 'run.json'), 'utf8');
  const abs = path.resolve(project);
  for (const form of [abs, JSON.stringify(abs).slice(1, -1), abs.split(path.sep).join('/')]) {
    assert.ok(!text.includes(form), `run.json guarda ${form}`);
  }
});
