import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePresentation } from '../lib/presentation.mjs';

const expected = ({ presentation, artifact, designType, canvasConsent }) => {
  if (presentation !== 'auto') return { mode: 'local', consentNeeded: false };
  if (!artifact || !designType) return { mode: 'local', consentNeeded: false };
  if (canvasConsent === true) return { mode: 'canvas', consentNeeded: false };
  if (canvasConsent === undefined) return { mode: 'local', consentNeeded: true };
  return { mode: 'local', consentNeeded: false };
};

test('the 24 combinations match the table', () => {
  let n = 0;
  for (const presentation of ['auto', 'local']) {
    for (const artifact of [true, false]) {
      for (const designType of [true, false]) {
        for (const canvasConsent of [true, false, undefined]) {
          const args = { presentation, artifact, designType, canvasConsent };
          const got = decidePresentation(args);
          const want = expected(args);
          assert.equal(got.mode, want.mode, JSON.stringify(args));
          assert.equal(got.consentNeeded, want.consentNeeded, JSON.stringify(args));
          assert.ok(Array.isArray(got.reasons));
          n++;
        }
      }
    }
  }
  assert.equal(n, 24);
});

test('key cases and reasons', () => {
  const all = { artifact: true, designType: true, canvasConsent: true };
  assert.equal(decidePresentation({ presentation: 'local', ...all }).mode, 'local');
  assert.deepEqual(decidePresentation({ presentation: 'local', ...all }).reasons, ['presentation-local']);
  assert.deepEqual(decidePresentation({ presentation: 'auto', ...all, artifact: false }).reasons, ['no-artifact-tool']);
  assert.deepEqual(decidePresentation({ presentation: 'auto', ...all, designType: false }).reasons, ['no-design-type']);
  const asking = decidePresentation({ presentation: 'auto', ...all, canvasConsent: undefined });
  assert.deepEqual([asking.mode, asking.consentNeeded, asking.reasons], ['local', true, ['no-consent']]);
  assert.deepEqual(decidePresentation({ presentation: 'auto', ...all, canvasConsent: false }).reasons, ['consent-declined']);
  assert.equal(decidePresentation({ presentation: 'auto', ...all }).mode, 'canvas');
});
