'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Revisa la sintaxis de cada .js bajo lib/ y scripts/.
let bad = 0;
for (const dir of ['lib', 'scripts']) {
  for (const name of fs.readdirSync(path.join(__dirname, '..', dir))) {
    if (!name.endsWith('.js')) continue;
    const r = spawnSync(process.execPath, ['--check', path.join(__dirname, '..', dir, name)]);
    if (r.status !== 0) { bad += 1; console.error(`${dir}/${name}: sintaxis inválida`); }
  }
}
process.exit(bad ? 1 : 0);
