// Graders of the form rules (R-5) and the fonts rule (R-19) in the ui-option eval cases (hito 4c, T5):
// they accept a correct screen and each rejects the defect it is named after. No paid run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './helpers.mjs';
import { CASES } from './evals/ui-cases.mjs';

const require = createRequire(import.meta.url);
const TRACES = path.join(REPO_ROOT, 'tests', 'evals', 'traces.js');
const traces = fs.existsSync(TRACES) ? require(TRACES) : null;
const skip = traces ? false : `falta ${TRACES}`;

const GOOD = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Mi cuenta</title><style>body{margin:0}</style></head>
<body><main><h1>Mi cuenta</h1><a href="detalle.html" data-primary="true">Ver detalle</a></main></body></html>
`;
const BREAK = {
  'no-braces': (h) => h.replace('<main>', '<main><p>{{saldo}}</p>'),
  'no-control-in-link': (h) => h.replace('Ver detalle', '<button>Ver detalle</button>'),
  'no-reserved-tags': (h) => h.replace('<main>', '<main><sc-if></sc-if>'),
  'fonts-only-canvas': (h) => h.replace('<title>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap"><title>'),
};

test('the mockup cases carry the destination and a grader per rule of form and per font rule', () => {
  const mockups = CASES().filter((c) => c.kind === 'option' && c.folder.includes('option-'));
  assert.equal(mockups.length, 2);
  for (const c of mockups) {
    assert.ok(c.brief.includes('destination: local'), `${c.name}: the brief names the destination`);
    for (const s of c.screens) for (const rule of Object.keys(BREAK)) assert.ok(c.graders.some((g) => g.name === `${rule}-${s}`), `${c.name}: ${rule}-${s}`);
  }
});

test('each new grader accepts a correct screen and rejects its own defect', { skip }, () => {
  const c = CASES().find((x) => x.name === 'ui-option-mockup');
  const file = `${c.folder}/inicio.html`;
  for (const [rule, mutate] of Object.entries(BREAK)) {
    const g = c.graders.find((x) => x.name === `${rule}-inicio.html`);
    assert.ok(g, rule);
    assert.ok(traces.grade(g, { trace: [], files: { [file]: GOOD } }), `${rule} rejects a correct screen`);
    assert.ok(!traces.grade(g, { trace: [], files: { [file]: mutate(GOOD) } }), `${rule} accepts its own defect`);
  }
});

test('a plain <a> next to a button is not a control inside a link', { skip }, () => {
  const c = CASES().find((x) => x.name === 'ui-option-mockup');
  const g = c.graders.find((x) => x.name === 'no-control-in-link-inicio.html');
  const html = GOOD.replace('</main>', '<button>Aparte</button></main>');
  assert.ok(traces.grade(g, { trace: [], files: { [`${c.folder}/inicio.html`]: html } }));
});
