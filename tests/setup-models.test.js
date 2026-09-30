'use strict';
// setup.js models: el modelo de cada rol según el perfil (§7), para los despachos de las skills.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { main } = require('../plugins/pignolo/scripts/setup');

function envWith(config) {
  const home = path.join(makeTempDir(), '.pignolo');
  if (config) {
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config));
  }
  return { PIGNOLO_HOME: home };
}

test('models sin config: balanced, revisores en opus e implementer en sonnet', () => {
  const r = main(['models'], envWith(null));
  assert.strictEqual(r.profile, 'balanced');
  assert.strictEqual(r.models['review-risk'], 'opus');
  assert.strictEqual(r.models.implementer, 'sonnet');
});

test('models con max y una sobrescritura por rol', () => {
  const r = main(['models'], envWith({ profile: 'max', models: { fixer: 'sonnet' } }));
  assert.strictEqual(r.profile, 'max');
  assert.strictEqual(r.models.implementer, 'opus');
  assert.strictEqual(r.models.fixer, 'sonnet');
});
