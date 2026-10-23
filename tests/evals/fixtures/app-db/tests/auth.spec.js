'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { hash, login, userIdFor } = require('../src/auth');

test('login con la clave correcta devuelve un token', () => {
  const user = { id: 1, passwordHash: hash('clave-de-prueba') };
  const token = login(user, 'clave-de-prueba');
  assert.ok(token);
  assert.strictEqual(userIdFor(token), 1);
});

test('login con la clave incorrecta devuelve null', () => {
  const user = { id: 1, passwordHash: hash('clave-de-prueba') };
  assert.strictEqual(login(user, 'otra'), null);
});

test('el hash existe', () => {
  assert.ok(hash('x'));
});
