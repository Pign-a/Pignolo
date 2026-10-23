// Labelled sample data (spec §7.1, 0.7.3): what lib/sample-data.mjs decides about the rule "data the user gave is literal; the rest
// is realistic sample data marked data-sample, with one visible line "Datos de muestra" per screen". Synthetic data only.
// The cases through options-check, approve, the canvas converter and the leak check went with those modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSampleData } from '../lib/sample-data.mjs';

const doc = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;
const GOOD = doc('<main><h1>Mi cuenta</h1><p data-sample>$ 12.480,00</p><ul><li data-sample>Alquiler</li></ul></main><p>Datos de muestra</p>');
const codes = (html, opts) => checkSampleData(html, opts);

test('a screen with marked sample values and its line has no problem and no warning', () => {
  assert.deepEqual(codes(GOOD), { problems: [], warnings: [] });
  assert.deepEqual(codes(GOOD, { provided: [] }), { problems: [], warnings: [] });
});

test('no-sample-strip: data-sample without the visible line; a hidden, commented or attribute-only line does not count', () => {
  const body = '<main><h1>Mi cuenta</h1><p data-sample>$ 12.480,00</p></main>';
  assert.deepEqual(codes(doc(body)).problems, ['no-sample-strip']);
  for (const line of ['<!-- Datos de muestra -->', '<p hidden>Datos de muestra</p>', '<p aria-hidden="true">Datos de muestra</p>', '<p style="display:none">Datos de muestra</p>', '<p title="Datos de muestra">x</p>']) {
    assert.deepEqual(codes(doc(body + line)).problems, ['no-sample-strip'], line);
  }
  assert.deepEqual(codes(doc(body + '<footer>Datos  de\nmuestra</footer>')).problems, []);
  // a screen without sample values (everything came from the user) needs no line
  assert.deepEqual(codes(doc('<main><h1>Mi cuenta</h1></main>')).problems, []);
});

test('empty-sample: a data-sample element with no text says nothing', () => {
  assert.deepEqual(codes(doc('<main><p data-sample></p></main><p>Datos de muestra</p>')).problems, ['empty-sample']);
  assert.deepEqual(codes(doc('<main><input data-sample value="Ana" aria-label="x"></main><p>Datos de muestra</p>')).problems, []);
});

test('bare-placeholder: a lone ‹…› is no longer a sample value', () => {
  assert.deepEqual(codes(doc('<main><p>\u2039saldo\u203a</p></main>')).problems, ['bare-placeholder']);
});

test('real-looking-contact: an email outside the reserved domains and a phone number fail; reserved domains and amounts do not', () => {
  const page = (p) => doc(`<main><p data-sample>${p}</p></main><p>Datos de muestra</p>`);
  assert.deepEqual(codes(page('ana@empresa.com')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('+54 11 5555 1234')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('(011) 5555-1234')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('ana@example.com')).problems, []);
  assert.deepEqual(codes(page('ana@correo.test')).problems, []);
  assert.deepEqual(codes(page('$ 1.234.567,89 el 2026-10-01')).problems, []);
});

test('unmarked-sample: with the literal values of the brief, an amount or a date outside data-sample must be one of them', () => {
  const page = doc('<main><p data-sample>$ 12.480,00</p><p>Vence el 05/11/2026</p><p>Saldo: $ 3.200,00</p></main><p>Datos de muestra</p>');
  assert.deepEqual(codes(page, { provided: ['$ 3.200,00'] }).problems, ['unmarked-sample']);
  assert.deepEqual(codes(page, { provided: ['$ 3.200,00', 'Vence el 05/11/2026'] }).problems, []);
  assert.deepEqual(codes(page, { provided: [] }).problems, ['unmarked-sample']);
  // the marked value and the line itself are never reported
  assert.deepEqual(codes(doc('<main><p data-sample>$ 12.480,00</p></main><p>Datos de muestra 2026-10-01</p>'), { provided: [] }).problems, []);
});

test('without the brief values the unmarked amount or date is only a warning: the script cannot tell the sample from what the user gave', () => {
  const page = doc('<main><p>Saldo: $ 3.200,00</p></main>');
  assert.deepEqual(codes(page), { problems: [], warnings: ['maybe-unmarked-sample'] });
});
