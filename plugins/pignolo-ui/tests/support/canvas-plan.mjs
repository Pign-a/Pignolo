// Fixtures of the publication tests: synthetic artifact addresses (built at run time, so no literal
// link sits in a versioned file) and everything `canvas-index plan` needs besides the run.
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir } from '../helpers.mjs';
import { canvasIndex } from './canvas-run.mjs';

export const fakeUrl = (n = 1) => ['https://claude.ai', 'artifact', `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`].join('/');
export const TYPE_URL = 'https://example.test/types/design-fixture';
export const LEAK_VALUES = ['Persona Ejemplo', 'persona@ejemplo.test', 'usuario-ejemplo'];

export function planKit(r, { values = LEAK_VALUES, types = { design: TYPE_URL } } = {}) {
  const dir = makeTempDir();
  const valuesFile = path.join(dir, 'leak-values.json');
  const typesFile = path.join(dir, 'types.json');
  const data = path.join(dir, 'data');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(valuesFile, JSON.stringify(values));
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
