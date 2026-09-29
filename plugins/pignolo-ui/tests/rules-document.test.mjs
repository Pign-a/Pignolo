// Unit tests for the document-level rules helpers (Task 4). The fixtures cover the rules themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBcp47Shape } from '../lib/rules/document.mjs';

test('isBcp47Shape accepts well-formed tags', () => {
  for (const tag of ['en', 'es-419', 'zh-Hant-TW', 'sr-Latn-RS', 'de-CH-1996']) {
    assert.equal(isBcp47Shape(tag), true, tag);
  }
});

test('isBcp47Shape rejects malformed tags', () => {
  for (const tag of ['en_US', 'e', 'español', '123', '']) {
    assert.equal(isBcp47Shape(tag), false, JSON.stringify(tag));
  }
});
