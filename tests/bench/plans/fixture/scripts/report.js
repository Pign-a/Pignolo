'use strict';
const path = require('node:path');
const { load } = require('../lib/store');
const { summarize } = require('../lib/report');

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'cart.json');
const cart = load({ file });
if (!cart) {
  console.error(`no hay carrito en ${file}`);
  process.exit(1);
}
console.log(summarize({ cart }));
