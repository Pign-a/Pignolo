'use strict';
const { total } = require('./cart');
const { formatAmount } = require('./money');

function summarize({ cart }) {
  const lines = cart.items.map((i) => `${i.sku} x${i.qty}`);
  lines.push(`total: ${formatAmount({ cents: total({ cart }) })}`);
  return lines.join('\n');
}

module.exports = { summarize };
