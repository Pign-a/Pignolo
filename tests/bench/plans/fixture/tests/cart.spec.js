'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newCart, addItem, removeItem, total } = require('../lib/cart');

test('addItem suma cantidades del mismo sku', () => {
  const cart = newCart();
  addItem({ cart, sku: 'A', qty: 1, priceCents: 500 });
  addItem({ cart, sku: 'A', qty: 2, priceCents: 500 });
  assert.strictEqual(cart.items.length, 1);
  assert.strictEqual(total({ cart }), 1500);
});

test('removeItem quita el sku', () => {
  const cart = newCart();
  addItem({ cart, sku: 'A', qty: 1, priceCents: 500 });
  removeItem({ cart, sku: 'A' });
  assert.strictEqual(total({ cart }), 0);
});
