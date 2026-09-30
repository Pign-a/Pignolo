'use strict';

function newCart() {
  return { items: [] };
}

function addItem({ cart, sku, qty, priceCents }) {
  const found = cart.items.find((i) => i.sku === sku);
  if (found) found.qty += qty;
  else cart.items.push({ sku, qty, priceCents });
  return cart;
}

function removeItem({ cart, sku }) {
  cart.items = cart.items.filter((i) => i.sku !== sku);
  return cart;
}

function total({ cart }) {
  return cart.items.reduce((sum, i) => sum + i.qty * i.priceCents, 0);
}

module.exports = { newCart, addItem, removeItem, total };
