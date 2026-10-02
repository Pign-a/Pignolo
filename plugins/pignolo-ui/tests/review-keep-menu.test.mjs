// Review of 0.7.4 (finding A-1): the optional `keep` line is "not a finding" and "no script decides
// with it" (R-4e-20, CHANGELOG 0.7.4), but `bad-keep` is reported with index -1 and `run.mjs menu`
// treats any index -1 problem as "the whole auditor output is untrusted": one invalid `keep`
// (too long, empty or null) makes the improve menu forget every valid finding of the auditor.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const RUN_REL = '.pignolo-ui/runs/r1';
const J01 = { id: 'J-01', severity: 'medio', scope: 'new', plain: 'No se sabe qué es lo principal', evidence: { kind: 'file', path: 'src/a.css', line: 1 }, why: 'Judgment: two buttons weigh the same' };

function menuWith(extra) {
  const project = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: project });
  writeTree(project, {
    'src/a.css': 'a{}\nb{}\n',
    [`${RUN_REL}/ui-check.json`]: JSON.stringify({ entries: [] }),
    [`${RUN_REL}/auditor.json`]: JSON.stringify({ findings: [J01], notVerified: [], independent: true, ...extra }),
  });
  const r = runScript('run.mjs', ['menu', '--run', path.join(project, RUN_REL)]);
  assert.equal(r.status, 0, r.stderr);
  return r.json.menu.find((m) => m.rules.includes('J-01'));
}

test('guard: a valid J-01 finding preticks its symptom, with no keep and with a valid keep', () => {
  assert.equal(menuWith({}).preticked, true);
  assert.equal(menuWith({ keep: 'The summary table reads well' }).preticked, true);
});

test('review A-1: an invalid keep line does not make the menu drop the valid findings of the auditor', () => {
  for (const [name, keep] of [['161 characters', 'k'.repeat(161)], ['empty', ''], ['null', null], ['two lines', 'a\nb']]) {
    assert.equal(menuWith({ keep }).preticked, true, `keep ${name}: the J-01 finding is valid and must still pretick its symptom`);
  }
});
