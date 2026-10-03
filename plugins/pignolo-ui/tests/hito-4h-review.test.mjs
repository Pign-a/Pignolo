// Revisión del hito 4h: hallazgos importantes deterministas, como tests que hoy fallan.
// Correr desde cualquier carpeta: node --test --test-reporter=dot <este archivo>
// Para copiarlo a plugins/pignolo-ui/tests/, cambiar PLUGIN por la ruta relativa ('..').
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeTempDir } from './helpers.mjs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = (n) => import(pathToFileURL(path.join(PLUGIN, 'lib', n)).href);
const read = (...p) => fs.readFileSync(path.join(PLUGIN, ...p), 'utf8');
const GATE_MARK = 'extraídos, no decididos';

function projectWithStyles() {
  const dir = makeTempDir('pgn-4h-review-');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"demo"}\n');
  fs.writeFileSync(path.join(dir, 'src', 'app.css'), 'body{color:#1a1a1a;background:#ffffff;font-family:Georgia,serif}\n.btn{background:#0b6bcb;color:#ffffff;border-radius:6px}\n.card{border-radius:12px;background:#f5f5f5}\n.a{color:#0b6bcb}\n');
  return dir;
}

// I-1. Causa: la compuerta busca "extraídos, no decididos" y design-extract escribe "extracted, not decided".
test('I-1: la propuesta de extract lleva la marca que foundation.md busca, y solo en el cuerpo', async (t) => {
  const { extractDesign } = await lib('design-extract.mjs');
  const dir = projectWithStyles();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.ok(read('reference', 'foundation.md').includes(GATE_MARK), 'foundation.md nombra la marca');
  const { text } = extractDesign(dir, { date: '2026-10-02' });
  assert.ok(text, 'hay propuesta');
  const end = text.indexOf('\n---', 4);
  assert.ok(text.slice(end).includes(GATE_MARK), 'el cuerpo de la propuesta no tiene la marca de la compuerta: un DESIGN.md extraído pasa como decidido');
  assert.ok(!text.slice(0, end).includes(GATE_MARK) && !/extracted, not decided/.test(text.slice(0, end)), 'la marca no va en el front matter');
});

// I-2. Causa: define fija `--path design/approved/direction` en record, y save puede haber guardado en direction-v2.
test('I-2: define registra la ruta que imprimió approve.mjs save, no una ruta fija', () => {
  const text = read('skills', 'define', 'SKILL.md');
  assert.ok(!/approve\.mjs" record[^`]*--path design\/approved\/direction(?![\w-])/.test(text), 'record con la ruta fija registra el manifest de una dirección anterior cuando save cayó en direction-v2');
  assert.ok(!/the flow is `direction-v2`/.test(text), '`--flow direction-v2` da exit 2 (falta --brief-file): el flujo siempre es `direction`, lo que cambia es la ruta impresa');
});

// I-3. Causa: design-md.mjs patch no tiene operación que borre texto del cuerpo; define dice que el patch quita la marca.
test('I-3: el camino que define nombra para un DESIGN.md con la marca la puede quitar', async (t) => {
  const { extractDesign } = await lib('design-extract.mjs');
  const { patchDesign } = await lib('design-patch.mjs');
  const dir = projectWithStyles();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { text, extracted } = extractDesign(dir, { date: '2026-10-02' });
  const ops = [{ op: 'set', path: ['description'], value: 'Decidido por el autor.' }, ...extracted.map((value) => ({ op: 'remove-item', path: ['pignolo', 'extracted'], value }))];
  const r = patchDesign(text, ops);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(!/extracted, not decided|extraídos, no decididos/.test(r.text), 'tras el patch la marca sigue en el cuerpo: define nunca puede dejar ese DESIGN.md como decidido');
});

// I-4. Causa: define corre publish-gate antes de crear la corrida y sin --run; un "no publiques" de esa corrida no se consulta.
test('I-4: define vuelve a pasar la compuerta de publicación con la corrida antes de Artifact', () => {
  const text = `${read('skills', 'define', 'SKILL.md')}
${read('reference', 'define-board.md')}`;
  const call = text.indexOf('then call Artifact');
  const before = text.slice(0, call);
  assert.ok(/publish-gate[^`]*--run <run>/.test(before), 'ningún publish-gate con --run <run> antes de la llamada a Artifact');
  assert.ok(before.includes('no-publish'), 'define no dice qué hacer con "no publiques" (run.mjs no-publish)');
});
