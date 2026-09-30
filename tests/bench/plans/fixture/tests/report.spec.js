'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newCart, addItem } = require('../lib/cart');
const { summarize } = require('../lib/report');

test('summarize lista los items y el total', () => {
  const cart = newCart();
  addItem({ cart, sku: 'A', qty: 2, priceCents: 250 });
  assert.strictEqual(summarize({ cart }), 'A x2\ntotal: 5,00 ARS');
});
