'use strict';
// Cada plugin publicado sube su `version` en plugin.json y suma su entrada al CHANGELOG (sin eso `/plugin update` no lo toma).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

// El changelog del núcleo vive en la raíz del repo; el de cada plugin aparte, en su carpeta.
const PLUGINS = [
  { name: 'pignolo', manifest: ['plugins', 'pignolo', '.claude-plugin', 'plugin.json'], changelog: ['CHANGELOG.md'] },
  { name: 'pignolo-ui', manifest: ['plugins', 'pignolo-ui', '.claude-plugin', 'plugin.json'], changelog: ['plugins', 'pignolo-ui', 'CHANGELOG.md'] },
  { name: 'pignolo-panel', manifest: ['plugins', 'pignolo-panel', '.claude-plugin', 'plugin.json'], changelog: ['plugins', 'pignolo-panel', 'CHANGELOG.md'] },
];

for (const p of PLUGINS) {
  test(`changelog: ${p.name} version in plugin.json has its "## <version>" entry in the CHANGELOG`, () => {
    const { version } = JSON.parse(read(...p.manifest));
    assert.match(version, /^\d+\.\d+\.\d+$/);
    const heads = [...read(...p.changelog).matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]);
    assert.ok(heads.includes(version), `${p.name} ${version}: el CHANGELOG tiene ${heads.slice(0, 3).join(', ')}...`);
  });
}

test('changelog: the wizard plan versions are the ones the plan names (core 0.20.0 keeps its entry; panel 0.3.0)', () => {
  assert.ok(read(...PLUGINS[0].changelog).includes('## 0.20.0'), 'the 0.20.0 entry of the wizard stays in the changelog');
  assert.strictEqual(JSON.parse(read(...PLUGINS[2].manifest)).version, '0.3.0');
});
