// Transversal contract of the texts that touch the canvas (hito 4c, T9): one way to Artifact, never share, sizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';
import { readSkill, readReference, assertNoVariables } from './support/skill-checks.mjs';

const SKILLS = ['new', 'improve', 'audit'];
const REFERENCES = fs.readdirSync(path.join(PLUGIN_ROOT, 'reference')).filter((n) => n.endsWith('.md'));
const texts = () => [...SKILLS.map((n) => [`skills/${n}`, readSkill(n).text]), ...REFERENCES.map((n) => [`reference/${n}`, readReference(n)])];

test('no skill and no reference file calls Artifact to publish without naming canvas-index.mjs plan; none writes the publish action by hand', () => {
  for (const [name, text] of texts()) {
    if (!/Artifact/.test(text)) continue;
    assert.ok(text.includes('canvas-index.mjs'), `${name} mentions Artifact but not canvas-index.mjs`);
    assert.ok(/canvas-index\.mjs"? plan/.test(text) || /canvas-index\.mjs plan/.test(text), `${name}: Artifact without canvas-index.mjs plan`);
    assert.ok(!/action: "publish"/.test(text), `${name}: the publish call must come from the printed step, not from the text`);
  }
});

test('force, overwrite_unread, from_url, share, public and capabilities appear only in a "never" sentence', () => {
  for (const [name, text] of texts()) {
    for (const word of ['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities']) {
      for (const sentence of text.split(/(?<=[.!?])\s+|\n/).filter((x) => new RegExp(`\\b${word}\\b`).test(x))) {
        assert.ok(/\bnever[* ]+(?:pass|use|share|call|ask|publish)\b|\bnunca\b/i.test(sentence.replace(/[*`]/g, '')), `${name}: ${word} outside a never sentence: ${sentence.slice(0, 80)}`);
      }
    }
  }
});

test('reference files hold no variables and SKILL.md files stay within 12000 characters', () => {
  for (const n of REFERENCES) assertNoVariables(readReference(n));
  for (const n of SKILLS) assert.ok(readSkill(n).text.length <= 12000, `${n}: ${readSkill(n).text.length}`);
});

test('the skills tell the facts of the first line: report-line takes canvas (published or local-fallback) and its reasons', () => {
  for (const n of ['new', 'improve']) {
    const { text } = readSkill(n);
    assert.ok(text.includes('report-line') && text.includes('local-fallback') && text.includes('published'), n);
  }
  assert.ok(readReference('present-and-choose.md').includes('lienzo: local ('));
});

test('options.md carries the destination to the briefs and to options-check (R-19)', () => {
  const text = readReference('options.md');
  assert.ok(text.includes('destination: canvas') && text.includes('--destination <destination>'));
});

test('the opt-out is first: in new and improve publish-gate precedes the first Artifact call; present-and-choose never calls Artifact in local mode', () => {
  for (const n of ['new', 'improve']) {
    const { text } = readSkill(n);
    assert.ok(text.indexOf('publish-gate') >= 0 && text.indexOf('publish-gate') < text.indexOf('scope: "types"'), n);
  }
  assert.ok(readReference('present-and-choose.md').toLowerCase().includes('never call artifact when the mode is local'));
});
