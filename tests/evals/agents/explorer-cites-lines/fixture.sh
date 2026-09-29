#!/usr/bin/env bash
# Synthetic fixture: a small invented order service (no real data).
set -e
mkdir -p src tests
cat > src/server.js <<'X'
const { createOrder } = require('./orders');
const { log } = require('./logger');

function handle(req) {
  log('request received');
  return createOrder(req.body);
}

module.exports = { handle };
X
cat > src/orders.js <<'X'
const { validateOrder } = require('./validate');
const { save } = require('./store');

function createOrder(input) {
  const errors = validateOrder(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, id: save(input) };
}

module.exports = { createOrder };
X
cat > src/validate.js <<'X'
const MAX_ITEMS = 50;

function validateOrder(input) {
  const errors = [];
  if (!input || typeof input.customer !== 'string') {
    errors.push('customer must be a string');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push('items must be a non-empty array');
  } else if (input.items.length > MAX_ITEMS) {
    errors.push('too many items');
  }
  return errors;
}

module.exports = { validateOrder };
X
cat > src/store.js <<'X'
const rows = [];

function save(order) {
  rows.push(order);
  return rows.length;
}

module.exports = { save };
X
cat > src/logger.js <<'X'
function log(msg) {
  console.log('[svc] ' + msg);
}

module.exports = { log };
X
cat > tests/validate.test.js <<'X'
const { validateOrder } = require('../src/validate');

console.assert(validateOrder({ customer: 'a', items: [1] }).length === 0);
console.assert(validateOrder({ customer: 1, items: [] }).length === 2);
X
