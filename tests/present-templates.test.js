'use strict';
// Plantillas visuales de presentación (hito 5b, Task 17). Ningún formato queda aprobado
// sin el autor: APPROVALS.md se entrega sin aprobaciones.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const { FORMATS, scanPublishable, templateApproved } = require('../plugins/pignolo/lib/present');

const DIR = path.join(PLUGIN_ROOT, 'templates', 'present');
const html = (f) => fs.readFileSync(path.join(DIR, `${f}.html`), 'utf8');

for (const f of FORMATS) {
  test(`${f}.html: publicable, autocontenida, con formato y versión y al menos dos opciones`, () => {
    const h = html(f);
    assert.deepStrictEqual(scanPublishable(h), []);
    assert.match(h, new RegExp(`<!-- pignolo-present: formato=${f} version=1 -->`));
    assert.doesNotMatch(h, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i, 'recurso remoto');
    assert.doesNotMatch(h, /url\(\s*["']?(?:https?:)?\/\//i, 'recurso remoto en CSS');
    assert.doesNotMatch(h, /@import|<script|<link/i);
    assert.ok((h.match(/data-option="[^"]+"/g) || []).length >= 2);
    assert.ok(!h.includes('\r'), 'CRLF');
    assert.notStrictEqual(h.charCodeAt(0), 0xfeff, 'BOM');
  });
}

test('con APPROVALS.md sin aprobaciones, los cuatro formatos dan false', () => {
  for (const f of FORMATS) assert.strictEqual(templateApproved({ pluginRoot: PLUGIN_ROOT, format: f }).approved, false, f);
});

function pluginCopy(approvals, files) {
  const root = makeTempDir();
  const d = path.join(root, 'templates', 'present');
  fs.mkdirSync(d, { recursive: true });
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(d, n), c);
  fs.writeFileSync(path.join(d, 'APPROVALS.md'), approvals);
  return root;
}

test('con la aprobación registrada de la plantilla de hoy da true; con otra versión de la cabecera, false', () => {
  const h = html('simple');
  const sha = crypto.createHash('sha256').update(h).digest('hex');
  const line = `- simple v1 — aprobado 2026-10-01 — sha256 ${sha}\n`;
  assert.strictEqual(templateApproved({ pluginRoot: pluginCopy(line, { 'simple.html': h }), format: 'simple' }).approved, true);
  const h2 = h.replace('version=1', 'version=2');
  const sha2 = crypto.createHash('sha256').update(h2).digest('hex');
  const r = templateApproved({ pluginRoot: pluginCopy(`- simple v1 — aprobado 2026-10-01 — sha256 ${sha2}\n`, { 'simple.html': h2 }), format: 'simple' });
  assert.strictEqual(r.approved, false);
  assert.match(r.reason, /v1.*v2/);
});

test('APPROVALS.md entregado: encabezado sin ninguna línea de aprobación', () => {
  const a = fs.readFileSync(path.join(DIR, 'APPROVALS.md'), 'utf8');
  assert.match(a, /^# Aprobaciones de plantillas/);
  assert.doesNotMatch(a, /^-\s+\w+\s+v\d+/m);
});

const { sameOptions } = require('../plugins/pignolo/lib/present');

test('decision.html (M2): sus opciones pasan sameOptions con rótulos naturales (la descripción no es parte del rótulo)', () => {
  const r = sameOptions([{ id: 'archivo', label: 'Archivo local' }, { id: 'base', label: 'Base de datos' }], html('decision'));
  assert.deepStrictEqual(r, { same: true, extra: [], missing: [], changed: [] });
});

test('toda plantilla: el rótulo de cada data-option es corto (una línea sin punto final: sin descripción adentro)', () => {
  for (const f of FORMATS) {
    for (const m of html(f).matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-option\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const label = m[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      assert.ok(label.length <= 60 && !/\.\s*$/.test(label), `${f}.html ${m[2]}: "${label}"`);
    }
  }
});
