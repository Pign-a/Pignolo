# Plan clean: tope de cantidad por item

> Plan en tarjetas. Cada tarea: archivos, interfaces, pasos con casillas.

**Objetivo:** un item no puede superar 99 unidades en el carrito.

## Tareas

### Task T1: `clampQty`

**Files:** Create `lib/limits.js`; Test `tests/limits.spec.js`.

**Interfaces:** Produce: `clampQty({ qty, max })` → `qty` limitado a `max` (por defecto 99); lanza `RangeError` si `qty` es menor que 1.

- [ ] Test primero y su rojo:

```js
// test: tests/limits.spec.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { clampQty } = require('../lib/limits');

test('clampQty limita a 99 y rechaza menos de 1', () => {
  assert.strictEqual(clampQty({ qty: 500 }), 99);
  assert.strictEqual(clampQty({ qty: 3 }), 3);
  assert.throws(() => clampQty({ qty: 0 }), RangeError);
});
```

- [ ] Implementar:

```js
'use strict';

function clampQty({ qty, max = 99 }) {
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError(`cantidad inválida: ${qty}`);
  return Math.min(qty, max);
}

module.exports = { clampQty };
```

- [ ] Verde y commit.

### Task T2: `addItem` usa el tope

**Files:** Modify `lib/cart.js`; Test `tests/cart-limit.spec.js`.

**Interfaces:** Consume: `clampQty({ qty, max })` de T1 y `total({ cart })` de `lib/cart.js`. `addItem({ cart, sku, qty, priceCents })` guarda la cantidad ya limitada, también cuando suma a un item que ya estaba.

- [ ] Test primero y su rojo (hoy `addItem` no limita):

```js
// test: tests/cart-limit.spec.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newCart, addItem } = require('../lib/cart');

test('addItem no pasa de 99 unidades por sku', () => {
  const cart = newCart();
  addItem({ cart, sku: 'A', qty: 60, priceCents: 100 });
  addItem({ cart, sku: 'A', qty: 60, priceCents: 100 });
  assert.strictEqual(cart.items[0].qty, 99);
});
```

- [ ] Implementar en `lib/cart.js`: limitar `qty` al crear el item y `found.qty + qty` al sumar; verde y commit.

### Task T3: verificación

- [ ] Correr `npm test` y `npm run lint`; los dos tienen que salir en 0. Comprobar a mano con `node scripts/lint.js` si el segundo falla.
