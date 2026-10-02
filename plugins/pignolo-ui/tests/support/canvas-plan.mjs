// Fixtures of the publication tests: synthetic artifact addresses (built at run time, so no literal
// link sits in a versioned file) and everything `canvas-index plan` needs besides the run.
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir } from '../helpers.mjs';
import { canvasIndex } from './canvas-run.mjs';

export const fakeUrl = (n = 1) => ['https://claude.ai', 'artifact', `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`].join('/');
export const TYPE_URL = 'https://example.test/types/design-fixture';
export const LEAK_VALUES = ['Persona Ejemplo', 'persona@ejemplo.test', 'usuario-ejemplo'];

export function planKit(r, { values = LEAK_VALUES, types = { design: TYPE_URL }, data: sharedData = null } = {}) {
  const dir = makeTempDir();
  const valuesFile = path.join(dir, 'leak-values.json');
  const typesFile = path.join(dir, 'types.json');
  // a second run of the same project shares the data folder (project.json says which canvas the project has)
  const data = sharedData ?? path.join(dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(valuesFile, JSON.stringify(values));
  // like `run.mjs leak-values`: the origins sit next to the values (plan fails closed without them)
  fs.writeFileSync(path.join(dir, 'leak-origins.json'), JSON.stringify({ 'os-user': true, home: true, 'git-name': true, 'git-email': true, 'account-email': false, git: 'ok' }));
  fs.writeFileSync(typesFile, JSON.stringify(types));
  const plan = (extra = []) => canvasIndex(['plan', '--project', r.project, '--run', r.run, '--values-file', valuesFile, '--types-file', typesFile, '--data', data, ...extra]);
  const record = (step, url, extra = []) => canvasIndex(['record', '--run', r.run, '--step', step, '--url', url, '--data', data, '--project', r.project, ...extra]);
  const merge = (extra = ['--live', 'none', '--live-dir', 'none']) => canvasIndex(['merge', '--run', r.run, ...extra]);
  return { dir, valuesFile, typesFile, data, plan, record, merge };
}

// Every key and every string of a JSON value, to look for forbidden keys and markers.
export function walkJson(value, visit, where = '$') {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { visit(k, v, where); walkJson(v, visit, `${where}.${k}`); }
  } else if (Array.isArray(value)) value.forEach((v, i) => walkJson(v, visit, `${where}[${i}]`));
}

// What the canvas holds after a publication nobody touched: the index we sent and the artboards we sent,
// laid out like what the tool saves on a read (<dir>/project/<name>). Snapshot BEFORE the next build (it rewrites canvas/).
export function snapshotLive(r) {
  const dir = makeTempDir();
  const src = path.join(r.run, 'canvas', 'project');
  fs.mkdirSync(path.join(dir, 'files', 'project'), { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f === 'canvas.json') fs.copyFileSync(path.join(src, f), path.join(dir, 'canvas.json'));
    else fs.copyFileSync(path.join(src, f), path.join(dir, 'files', 'project', f));
  }
  return { live: path.join(dir, 'canvas.json'), liveDir: path.join(dir, 'files'), dir };
}
