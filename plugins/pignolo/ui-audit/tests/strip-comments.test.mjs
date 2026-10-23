import test from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from '../lib/strip-comments.mjs';

const lines = (s) => s.split('\n').length;

const CASES = [
  { name: 'css block comment', syntax: 'css', text: '.a { color: red } /* .b { outline: none } */', absent: ['outline'], present: ['.a { color: red }'] },
  { name: 'css string with comment marker', syntax: 'css', text: 'a { content: "/* no */"; }', same: true },
  { name: 'html comment keeps line numbers', syntax: 'html', text: '<!-- <button></button> -->\n<p>x</p>', absent: ['button'], present: ['<p>x</p>'] },
  { name: 'html style block comment', syntax: 'html', text: '<style>a { color: red } /* outline: none */</style>', absent: ['outline'], present: ['color: red'] },
  { name: 'jsx line comment vs url in text', syntax: 'jsx', text: "const u = 'https://x'; // nota\n<a>https://y.com</a>", absent: ['nota'], present: ['https://x', 'https://y.com'] },
  { name: 'jsx expression comment', syntax: 'jsx', text: '<div>{/* <button/> */}</div>', absent: ['button'], present: ['<div>', '</div>'] },
  { name: 'jsx block comment in js', syntax: 'jsx', text: 'const a = 1; /* outline: none */\nconst b = `x // y`;', absent: ['outline'], present: ['`x // y`'] },
  { name: 'jsx comment marker in jsx text stays', syntax: 'jsx', text: '<p>a /* b */ c</p>', same: true },
  { name: 'jsx template interpolation comment', syntax: 'jsx', text: 'const s = `a ${x /* c */} b`;', absent: ['/* c */'], present: ['`a ${x'] },
  { name: 'js line comment', syntax: 'js', text: 'const a = "//"; // gone\nfoo();', absent: ['gone'], present: ['"//"', 'foo();'] },
  { name: 'vue template comment', syntax: 'vue', text: '<template><!-- <button/> --><p>x</p></template>\n<style>.a{} /* outline: none */</style>', absent: ['button', 'outline'], present: ['<p>x</p>'] },
  { name: 'svelte template comment', syntax: 'svelte', text: '<!-- <button/> -->\n<p>x</p>', absent: ['button'], present: ['<p>x</p>'] },
];

for (const c of CASES) {
  test(`strip ${c.name}`, () => {
    const out = stripComments(c.text, c.syntax);
    assert.equal(out.length, c.text.length);
    assert.equal(lines(out), lines(c.text));
    if (c.same) assert.equal(out, c.text);
    for (const s of c.absent ?? []) assert.ok(!out.includes(s), `should not contain ${s}`);
    for (const s of c.present ?? []) assert.ok(out.includes(s), `should contain ${s}`);
  });
}

test('strip keeps CRLF line endings', () => {
  for (const syntax of ['css', 'html', 'jsx', 'js', 'vue', 'svelte']) {
    const text = 'a\r\n/* x */\r\n<!-- y -->\r\nb\r\n';
    const out = stripComments(text, syntax);
    assert.equal(out.length, text.length, syntax);
    assert.equal(out.split('\r\n').length, text.split('\r\n').length, syntax);
  }
});

test('strip second line of an html comment stays on line 2', () => {
  const out = stripComments('<!-- a\nb -->\nX', 'html');
  assert.equal(out.split('\n')[2], 'X');
});
