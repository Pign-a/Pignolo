'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyDiscount } = require('../lib/discount');

test('applyDiscount redondea el descuento hacia abajo', () => {
  assert.strictEqual(applyDiscount({ total: 999, percent: 10 }), 900);
});

test('applyDiscount rechaza porcentajes fuera de rango', () => {
  assert.throws(() => applyDiscount({ total: 100, percent: 101 }), RangeError);
});
