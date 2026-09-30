'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { save, load } = require('../lib/store');

test('save y load van y vuelven', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-store-'));
  try {
    const file = path.join(dir, 'sub', 'c.json');
    save({ file, data: { a: 1 } });
    assert.deepStrictEqual(load({ file }), { a: 1 });
    assert.strictEqual(load({ file: path.join(dir, 'nada.json') }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
