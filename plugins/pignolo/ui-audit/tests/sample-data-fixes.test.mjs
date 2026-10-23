// Fix pass over the 0.7.3 final review (I3-I6): detection precision of lib/sample-data.mjs.
// I1 and I2 (options-check, approve) went with those modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSampleData } from '../lib/sample-data.mjs';

const doc = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;
const STRIP = '<p>Datos de muestra</p>';
const page = (inner) => doc(`<main>${inner}</main>${STRIP}`);
const problems = (html, opts) => checkSampleData(html, opts).problems;

// ---- I3: phone precision ----------------------------------------------------------------------------------------

test('I3: numbers that are not phones (neighbour cells, dates, times, order numbers, tax ids, year ranges) are not real-looking-contact', () => {
  const ok = [
    '<table><tr><td data-sample>12</td><td data-sample>2026-10-01</td></tr></table>',
    '<table><tr><td data-sample>1200</td><td data-sample>3400</td><td data-sample>560</td></tr></table>',
    '<p data-sample>2026-10-01 14:30</p>',
    '<p>Pedido 2026 000 123 45</p>',
    '<p data-sample>1 234 567 890</p>',
    '<p data-sample>12 34 56 78 90</p>',
    '<p data-sample>30-12345678-9</p>',
    '<p>Ejercicio 2024 - 2025 - 2026</p>',
    '<p data-sample>Del 2024-2025</p>',
    '<p data-sample>$ 1.234.567,89</p>',
    '<p data-sample>12/10/2026 08:15</p>',
  ];
  for (const inner of ok) assert.deepEqual(problems(page(inner)).filter((p) => p === 'real-looking-contact'), [], inner);
  // a line break between two texts never glues them into a phone
  assert.deepEqual(problems(page('<p data-sample>5555\n1234</p><p data-sample>5555\n1234</p>')), []);
});

test('I3: real phone shapes still fail, with and without separators', () => {
  for (const p of ['+54 11 5555 1234', '(011) 5555-1234', '011-5555-1234', '555-123-4567', '555.123.4567', '5555-1234', '1155551234', '+541155551234']) {
    assert.deepEqual(problems(page(`<p data-sample>${p}</p>`)), ['real-looking-contact'], p);
  }
});

// ---- I4: attributes and values split across tags ----------------------------------------------------------------

test('I4: emails and phones inside attributes or split across inline tags are detected', () => {
  const bad = [
    '<input data-sample aria-label="x" value="ana@empresa.com">',
    '<a data-sample href="mailto:ana@empresa.com">Escribir</a>',
    '<a data-sample href="tel:+541155551234">Llamar</a>',
    '<input data-sample aria-label="x" value="ok" placeholder="ana@empresa.com">',
    '<p data-sample title="ana@empresa.com">Hola</p>',
    '<p data-sample>ana@<b>empresa</b>.com</p>',
    '<p data-sample><span>ana</span>@empresa.com</p>',
    '<input data-sample aria-label="x" value="+54 11 5555 1234">',
  ];
  for (const inner of bad) assert.deepEqual(problems(page(inner)), ['real-looking-contact'], inner);
  // reserved domains and ordinary attributes stay fine
  assert.deepEqual(problems(page('<a data-sample href="mailto:ana@example.com">Escribir</a><input aria-label="Nombre" value="Lucía">')), []);
  // an unmarked value attribute is an unmarked sample, like unmarked text
  assert.deepEqual(problems(page('<input aria-label="Monto" value="$ 3.200,00">'), { provided: [] }), ['unmarked-sample']);
  assert.deepEqual(problems(page('<input aria-label="Monto" value="$ 3.200,00">'), { provided: ['3200'] }), []);
});

// ---- I5: provided values compared after normalising ---------------------------------------------------------------

test('I5: a value the user gave in another format is still the user value; a substring is not', () => {
  const amount = (shown) => page(`<p>${shown}</p>`);
  for (const [prov, shown] of [['3200', '$ 3.200,00'], ['$3200', '$ 3.200'], ['$ 3.200', '$3.200'], ['3.200,00', 'ARS 3200'], ['3200,50', '$ 3.200,5']]) {
    assert.deepEqual(problems(amount(shown), { provided: [prov] }), [], `${prov} -> ${shown}`);
  }
  for (const [prov, shown] of [['5 de noviembre de 2026', '05/11/2026'], ['2026-11-05', '05/11/2026'], ['05/11/2026', '2026-11-05'], ['Vence el 5/11/26', '05/11/2026']]) {
    assert.deepEqual(problems(amount(shown), { provided: [prov] }), [], `${prov} -> ${shown}`);
  }
  assert.deepEqual(problems(amount('$ 9.810,10'), { provided: ['10'] }), ['unmarked-sample']);
  assert.deepEqual(problems(amount('$ 9.111,00'), { provided: ['1'] }), ['unmarked-sample']);
  assert.deepEqual(problems(amount('$ 3.200,00'), { provided: ['3200,5'] }), ['unmarked-sample']);
  assert.deepEqual(problems(amount('05/11/2026'), { provided: ['06/11/2026'] }), ['unmarked-sample']);
  // sizes are not data
  assert.deepEqual(problems(amount('Ancho 1.200 px'), { provided: [] }), []);
});

// ---- I6: the bare placeholder is the pair ---------------------------------------------------------------------------

test('I6: a lone typographic chevron is not a bare placeholder; the pair is', () => {
  assert.deepEqual(problems(page('<a href="a.html">\u2039 Volver</a>')), []);
  assert.deepEqual(problems(page('<a href="a.html">Siguiente \u203a</a>')), []);
  assert.deepEqual(problems(page('<p>\u2039 Volver</p><p>Siguiente \u203a</p>')), []);
  assert.deepEqual(problems(page('<p>\u2039saldo\u203a</p>')), ['bare-placeholder']);
  assert.deepEqual(problems(page('<p>\u2039 saldo del mes \u203a</p>')), ['bare-placeholder']);
});
