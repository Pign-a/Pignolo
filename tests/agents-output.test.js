'use strict';
// Forma de salida de los revisores (hito 3b): un bloque json que ledger.js build copia tal
// cual. Solo forma, no el texto libre.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const agent = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');
const REVIEWERS = {
  'review-risk': 'risk', 'review-resilience': 'resilience', 'review-readability': 'readability',
  'review-reliability': 'reliability', 'review-testability': 'testability', 'judge-a': 'judge-a', 'judge-b': 'judge-b',
};

for (const [name, lens] of Object.entries(REVIEWERS)) {
  test(`${name}: hallazgos en un bloque json con las claves del ledger y su lente`, () => {
    const s = agent(name);
    assert.match(s, /one fenced `json` block/);
    assert.match(s, /keys in this order: `id`[^\n]*`lens` \(`[a-z-]+`\), `location` \(`path:line`[^\n]*`severity`, `evidence`[^\n]*`repro`/);
    assert.ok(s.includes(`\`lens\` (\`${lens}\`)`));
    assert.match(s, /APPROVE[^\n]*REQUEST_CHANGES[^\n]*ESCALATE/);
  });
}

test('refuter: veredictos en un bloque json claim, verdict, reason', () => {
  assert.match(agent('refuter'), /one fenced `json` block[^\n]*keys in this order: `claim`[^\n]*`verdict`, `reason`/);
});
