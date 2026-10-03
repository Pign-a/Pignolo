'use strict';
// RR-01: config de editor/SO en un repo recién iniciado no es "código o un manifiesto" (aviso init-blank-ready). Debe FALLAR con 6db4f4a.
// Copiar a tests/ del worktree para correrlo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, PLUGIN_ROOT } = require('./helpers');
const { hasCodeOrManifest } = require(path.join(PLUGIN_ROOT, 'lib', 'init-blank.js'));

for (const rel of ['.vscode/settings.json', '.idea/workspace.xml', '.editorconfig', '.DS_Store', '.gitkeep']) {
  test(`RR-01: ${rel} solo no es código ni manifiesto`, () => {
    const d = makeTempDir('pignolo-rr-');
    const f = path.join(d, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x\n');
    assert.equal(hasCodeOrManifest({ root: d }), false);
  });
}
