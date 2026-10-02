import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePresentation, gateDecision, NOTICE } from '../lib/presentation.mjs';

// The oracle is written apart from the implementation: the canvas needs the setting auto, no opt-out,
// a mockup, the Artifact tool and the "Design" type; there is no consent question (D-4c-3).
const oracle = ({ presentation, kind, artifact, designType, optOut }) => (
  presentation === 'auto' && kind === 'option' && artifact && designType && optOut === null ? 'canvas' : 'local');

test('the 32 combinations of presentation x kind x artifact x designType x optOut match the oracle', () => {
  let n = 0;
  for (const presentation of ['auto', 'local']) {
    for (const kind of ['option', 'direction']) {
      for (const artifact of [true, false]) {
        for (const designType of [true, false]) {
          for (const optOut of [null, 'project-opt-out']) {
            const args = { presentation, kind, artifact, designType, optOut };
            const got = decidePresentation(args);
            assert.equal(got.mode, oracle(args), JSON.stringify(args));
            assert.ok(Array.isArray(got.reasons));
            assert.equal(got.mode === 'canvas', got.reasons.length === 0);
            n++;
          }
        }
      }
    }
  }
  assert.equal(n, 32);
});

test('key cases: no question before the canvas; reasons in order', () => {
  const all = { presentation: 'auto', kind: 'option', artifact: true, designType: true, optOut: null };
  assert.deepEqual(decidePresentation(all), { mode: 'canvas', reasons: [] });
  assert.equal('consentNeeded' in decidePresentation(all), false);
  assert.deepEqual(decidePresentation({ ...all, kind: 'direction' }).reasons, ['style-tile-local']);
  assert.deepEqual(decidePresentation({ ...all, designType: false }).reasons, ['no-design-type']);
  assert.deepEqual(decidePresentation({ ...all, artifact: false }).reasons, ['no-artifact-tool']);
  assert.deepEqual(decidePresentation({ ...all, presentation: 'local' }).reasons, ['presentation-local']);
  assert.deepEqual(decidePresentation({ ...all, optOut: 'legacy-consent-declined' }).reasons, ['legacy-consent-declined']);
  assert.deepEqual(decidePresentation({ presentation: 'local', kind: 'direction', artifact: false, designType: false, optOut: 'project-opt-out' }).reasons,
    ['presentation-local', 'project-opt-out', 'style-tile-local', 'no-artifact-tool', 'no-design-type']);
});

test('gateDecision: only the literal auto with no opt-out is allowed', () => {
  assert.deepEqual(gateDecision({ presentation: 'auto' }), { allowed: true, reasons: [] });
  assert.deepEqual(gateDecision({ presentation: '${user_config.presentation}' }), { allowed: false, reasons: ['presentation-local'] });
  assert.deepEqual(gateDecision({ presentation: undefined }), { allowed: false, reasons: ['presentation-local'] });
  assert.deepEqual(gateDecision({ presentation: 'auto', projectOptOut: 'project-opt-out', runOptOut: true }).reasons, ['project-opt-out', 'run-opt-out']);
});

test('the notice says what is published, that it is private, never captures nor code, the fonts and how to opt out', () => {
  for (const w of ['privados de tu cuenta de claude.ai', 'nunca capturas ni código', 'Google Fonts', 'config set --key publish --value never']) assert.ok(NOTICE.includes(w), w);
  assert.ok(!NOTICE.includes('\n'), 'one line');
});
