'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseAmount, formatAmount } = require('../lib/money');

test('parseAmount acepta coma y punto', () => {
  assert.strictEqual(parseAmount('12,5'), 1250);
  assert.strictEqual(parseAmount('3.05'), 305);
  assert.strictEqual(parseAmount('7'), 700);
});

test('parseAmount rechaza basura', () => {
  assert.throws(() => parseAmount('abc'), /inválido/);
});

test('formatAmount usa coma decimal y moneda', () => {
  assert.strictEqual(formatAmount({ cents: 1250 }), '12,50 ARS');
  assert.strictEqual(formatAmount({ cents: -5, currency: 'USD' }), '-0,05 USD');
});
